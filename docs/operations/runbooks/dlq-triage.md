# Dead Letter Queue (DLQ) Triage Runbook - IntelliFlow CRM

**Document ID**: IFC-151-DLQ-TRIAGE
**Version**: 1.0.0
**Last Updated**: 2025-12-29
**Owner**: STOA-Domain (Backend Dev + SRE)

---

## 1. Overview

This runbook provides procedures for monitoring, diagnosing, and remediating domain event consumer failures in IntelliFlow CRM's Dead Letter Queue (DLQ). Events move to DLQ after exhausting all retry attempts and require manual triage.

### 1.1 DLQ Purpose

The DLQ is a safety net for domain events that cannot be processed by their handlers:
- **Poison messages**: Events that trigger bugs in handlers
- **Permanent failures**: External services down (no recovery expected)
- **Schema mismatches**: Handler expects different event structure
- **Configuration errors**: Handler misconfigured or disabled

### 1.2 Related Infrastructure

- **Event Publisher**: Writes to `domain_event_outbox` table (IFC-150)
- **Outbox Poller**: Polls and dispatches events (IFC-150)
- **Handlers**: Idempotent event consumers (IFC-150)
- **Metrics**: Prometheus counters tracked per event type

---

## 2. DLQ Monitoring & Alerting

### 2.1 Key Metrics

| Metric | Target | Alert Threshold | Check Frequency |
|--------|--------|-----------------|-----------------|
| DLQ Depth | 0 messages | >5 messages for >5 min | Every 1 minute |
| DLQ Drain Success | >95% | <95% success rate | Every 5 minutes |
| Retry Success Rate | >90% | <90% on first retry | Continuous |
| MTTR (Mean Time to Resolve) | <30 min | Alert when incident declared | Ongoing |

### 2.2 Prometheus Queries

**Current DLQ Depth** (messages pending triage):
```promql
increase(domain_events_dead_letter_total[5m])
```

**Drain Success Rate** (percentage of DLQ messages successfully reprocessed):
```promql
(
  increase(domain_events_dlq_drained_total[1h])
  /
  (increase(domain_events_dead_letter_total[1h]) + 1)
) * 100
```

**Retry Success Rate** (first attempt success percentage):
```promql
(
  increase(domain_events_published_total[5m])
  /
  (increase(domain_events_published_total[5m]) + increase(domain_events_dead_letter_total[5m]) + 1)
) * 100
```

### 2.3 Alert Configuration

**PagerDuty/Slack Integration**:

1. **CRITICAL**: DLQ >10 messages
   - Severity: P2 (High)
   - Response time: 15 minutes
   - Message: "DLQ backlog detected - {count} messages failing to process"

2. **WARNING**: DLQ >5 messages for >5 minutes
   - Severity: P3 (Medium)
   - Response time: 1 hour
   - Message: "DLQ accumulation alert - {event_type}: {count} failures"

3. **INFO**: Drain success <95%
   - Severity: P4 (Low)
   - Response time: Next business day
   - Message: "DLQ drain efficiency below target - {success_rate}%"

---

## 3. DLQ Triage Workflow

### 3.1 Incident Declaration

**When to declare a DLQ incident**:
- DLQ depth exceeds 10 messages
- DLQ drain success rate <95%
- Same event type failing repeatedly
- Handlers unable to recover automatically

**Declare incident**:
```bash
# Post to Slack
/incident-open dlq-backlog
# Include: event type, error message, handler affected
```

### 3.2 Investigation Procedure (10-15 minutes)

**Step 1: Identify Problem Messages**
```sql
-- Connect to database
psql $DATABASE_URL

-- Find DLQ messages
SELECT
  id,
  event_type,
  aggregate_type,
  retry_count,
  last_error,
  created_at,
  payload
FROM domain_event_outbox
WHERE status = 'dead_letter'
ORDER BY created_at DESC
LIMIT 20;

-- Group by event type and error
SELECT
  event_type,
  last_error,
  COUNT(*) as count
FROM domain_event_outbox
WHERE status = 'dead_letter'
GROUP BY event_type, last_error
ORDER BY count DESC;
```

**Step 2: Root Cause Analysis**

Check `last_error` field for common patterns:

| Error Pattern | Likely Cause | Investigation |
|---------------|--------------|----------------|
| `Cannot find handler for event` | Handler not registered | Check handler registration code |
| `Schema validation failed` | Event version mismatch | Check event contract version |
| `Connection timeout` | External service down | Check service health |
| `TypeError: Cannot read property 'x'` | Handler bug | Review handler code, check logs |
| `Unique constraint violation` | Idempotency failure | Check deduplication cache |

**Step 3: Examine Handler Logs**

```bash
# In Grafana/Loki, search for recent errors
label_name="handler"
label_name="{event_type}"
level="error"
timestamp > now() - 30m
```

Or via command line:
```bash
# Tail application logs
kubectl logs -f deployment/api-server \
  --container=app \
  --timestamps=true \
  | grep -i "error\|dlq\|handler"
```

---

## 4. Resolution Strategies

### 4.1 External Service Failure (Temporary)

**Example**: Email service timeout during send

**Resolution**:
1. Verify service status (check statuspage.io)
2. Wait for service recovery
3. Drain DLQ by replaying messages

```bash
# Once service recovered, trigger drain
curl -X POST \
  http://api.local:3000/admin/dlq/drain \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response:
# {"drained": 47, "failed": 0, "duration_ms": 340}
```

**Expected MTTR**: 5-15 minutes
**Drain success expectation**: 100% if root cause fixed

---

### 4.2 Event Schema Mismatch (Handler Upgrade)

**Example**: Handler expects `v2` schema, but events are `v1`

**Resolution**:
1. Verify event contract version
2. Deploy handler upgrade supporting new schema
3. Update event publisher if needed
4. Drain DLQ

```bash
# Check contract versions
cat docs/events/contracts-v1.yaml | grep -A5 "LeadCreated:"

# If handler needs update:
git log --oneline apps/api/src/handlers/lead-created.handler.ts

# Deploy handler fix
pnpm --filter api deploy:staging

# Once deployed, drain
curl -X POST http://api.local:3000/admin/dlq/drain
```

**Expected MTTR**: 15-30 minutes
**Drain success expectation**: 95%+ (some may need manual fixes)

---

### 4.3 Handler Bug (Code Fix Required)

**Example**: Handler throws TypeError on specific payload

**Resolution**:
1. Examine handler code and failing payload
2. Write minimal test case
3. Deploy fix
4. Replay messages (selective or full drain)

```bash
# Get first failing message
SELECT * FROM domain_event_outbox
WHERE status = 'dead_letter'
AND event_type = 'LeadCreated'
LIMIT 1;

# Save payload for test case
# Create regression test

# Fix the handler
vim apps/api/src/handlers/lead-created.handler.ts

# Run tests
pnpm --filter api test --watch

# Once fixed and tested:
pnpm --filter api deploy:staging

# Drain
curl -X POST http://api.local:3000/admin/dlq/drain
```

**Expected MTTR**: 20-40 minutes
**Drain success expectation**: >95%

---

### 4.4 Poison Message (Unfixable)

**Example**: Event payload corrupted, handler cannot process safely

**Resolution**:
1. Assess impact (is data loss acceptable?)
2. Either:
   - **Option A**: Delete message (data loss - document decision)
   - **Option B**: Replay with corrected payload (if fixable)
   - **Option C**: Escalate to CTO for business decision

```bash
-- Option A: Delete poison message
DELETE FROM domain_event_outbox
WHERE id = '{message_id}'
AND status = 'dead_letter';

-- Option B: Modify and retry
UPDATE domain_event_outbox
SET
  status = 'failed',
  payload = jsonb_set(payload, '{field}', '"corrected_value"'),
  retry_count = 0,
  next_retry_at = NOW()
WHERE id = '{message_id}';

-- Trigger drain
curl -X POST http://api.local:3000/admin/dlq/drain
```

**Expected MTTR**: 30+ minutes (requires decisions)
**Drain success expectation**: Varies (may have residual losses)

---

## 5. Automated Retry & Backoff Strategy

### 5.1 Retry Configuration

```typescript
// packages/adapters/src/events/outbox-poller.ts
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 5000, 30000], // 1s, 5s, 30s
  jitterFactor: 0.1, // Add 10% random jitter
};
```

### 5.2 Backoff Algorithm

```
Attempt 1: Immediate
Attempt 2: After 1 second + jitter
Attempt 3: After 5 seconds + jitter
Attempt 4 (DLQ): After 30 seconds + jitter, then dead letter
```

**Why exponential backoff?**
- Gives transient failures time to recover
- Reduces load during outages
- Prevents thundering herd on service restart

### 5.3 Customizing Backoff

For specific event types needing longer grace periods:

```typescript
const CUSTOM_BACKOFF = {
  'EmailSent': [5000, 30000, 120000], // 5s, 30s, 2min
  'PaymentProcessed': [10000, 60000, 300000], // 10s, 1min, 5min
};
```

---

## 6. DLQ Drain Procedure

### 6.1 Automatic Drain (Recommended)

Once root cause is fixed, trigger automatic replay:

```bash
# Full drain - replay all DLQ messages
curl -X POST \
  http://localhost:3000/admin/dlq/drain \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "strategy": "full",
    "timeout_ms": 60000
  }'

# Response:
{
  "status": "completed",
  "drained": 47,
  "failed": 2,
  "duration_ms": 8420,
  "failures": [
    {
      "message_id": "uuid-123",
      "event_type": "LeadCreated",
      "reason": "Handler timeout"
    }
  ]
}
```

### 6.2 Selective Drain (For Specific Events)

If only certain event types should be drained:

```bash
# Drain only 'LeadCreated' events
curl -X POST \
  http://localhost:3000/admin/dlq/drain \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "strategy": "by_event_type",
    "event_types": ["LeadCreated"],
    "timeout_ms": 30000
  }'
```

### 6.3 Manual Message Retry

For single message retry (use sparingly):

```bash
# Get message ID
SELECT id FROM domain_event_outbox
WHERE event_type = 'LeadCreated'
AND status = 'dead_letter'
LIMIT 1;

# Retry specific message
curl -X POST \
  http://localhost:3000/admin/dlq/retry \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "message_id": "550e8400-e29b-41d4-a716-446655440000",
    "reset_retries": true
  }'
```

---

## 7. Escalation & Handoff

### 7.1 Escalation Path

**If unable to resolve within SLA**:

1. **At 10 minutes**: Page on-call Tech Lead
   - Slack: @tech-lead-oncall
   - PagerDuty: Escalate incident

2. **At 20 minutes**: Conference call with Backend Team
   - Slack: /incident-call
   - Screen share Grafana + logs

3. **At 30 minutes (MTTR SLA)**:
   - Declare business impact
   - Escalate to CTO
   - Document decision for poison message handling

### 7.2 Handoff Template

When handing off to another engineer:

```markdown
## DLQ Incident Handoff

**Incident ID**: IFC-151-DLQ-{timestamp}
**Severity**: P{level}
**Duration**: {start} → {current}

### Current Status
- DLQ depth: {count} messages
- Event types affected: {list}
- Root cause identified: {yes/no}

### Last Action
- {action}
- Time: {timestamp}
- Result: {outcome}

### Next Steps
1. {recommendation}
2. {follow-up}
3. {escalation_if_needed}

### Relevant Links
- Grafana Dashboard: {link}
- Logs: {query}
- Code: {repository_path}

**Handed off to**: {engineer_name}
**Time**: {timestamp}
```

---

## 8. Post-Incident Review

### 8.1 Incident Report Template

After resolving DLQ incident, document:

```markdown
# DLQ Incident Report

**Incident ID**: IFC-151-DLQ-{timestamp}
**Event Type**: {EventName}
**Severity**: P{level}
**Duration**: {start_time} → {end_time} ({duration})

## Timeline
- {T+0m}: Alert triggered
- {T+5m}: Incident declared
- {T+15m}: Root cause identified
- {T+25m}: Fix deployed
- {T+28m}: DLQ drained (47 messages)
- {T+30m}: Incident resolved

## Root Cause
{Detailed explanation of why messages went to DLQ}

## Resolution
{What fixed the problem}

## Impact
- Messages recovered: 47
- Data loss: 0
- SLA met: ✓ (MTTR: 30 min, target: 30 min)

## Action Items
- [ ] Enhance alerting for {event_type}
- [ ] Add regression test for {scenario}
- [ ] Update {handler} error handling
- [ ] Document {pattern} in runbook

## Prevention
{How to prevent similar incidents}
```

### 8.2 KPI Review

Track incident metrics:

| Metric | Target | Q4 2025 | Trend |
|--------|--------|---------|-------|
| Avg Incident Duration | <30 min | 22 min | ↓ |
| DLQ Drain Success | >95% | 97% | ↑ |
| Retry Success on 1st Attempt | >90% | 93% | ✓ |
| Time to Root Cause | <15 min | 12 min | ↓ |

---

## 9. Troubleshooting Common Issues

### 9.1 DLQ Growing Continuously

**Symptom**: DLQ depth increases despite drain attempts

**Diagnosis**:
```bash
# Check if poller is running
kubectl logs deployment/api-server -c app | grep -i "poller\|outbox"

# Check handler registration
curl http://localhost:3000/admin/handlers

# Check error rate
SELECT
  event_type,
  COUNT(*) as failures,
  MAX(last_error) as recent_error
FROM domain_event_outbox
WHERE status = 'dead_letter'
GROUP BY event_type;
```

**Resolution**:
- Restart outbox poller
- Verify handler endpoints are healthy
- Check for memory leaks in handlers

---

### 9.2 Drain Taking Too Long

**Symptom**: Drain operation times out or runs very slowly

**Diagnosis**:
```bash
# Check database performance
EXPLAIN ANALYZE
SELECT id FROM domain_event_outbox
WHERE status = 'dead_letter'
ORDER BY created_at DESC;

# Check handler latency
curl http://localhost:3000/admin/handler-metrics
```

**Resolution**:
- Increase drain timeout: `timeout_ms: 120000`
- Reduce batch size: `batch_size: 50`
- Check external service latency
- Scale handler instances horizontally

---

### 9.3 Idempotency Cache Not Working

**Symptom**: Same message processed multiple times

**Diagnosis**:
```bash
# Check cache backend (Redis)
redis-cli PING

# Check cache statistics
curl http://localhost:3000/admin/cache-stats

# Verify idempotency keys
SELECT
  event_id,
  COUNT(*) as processed_count
FROM domain_event_outbox
WHERE status = 'published'
GROUP BY event_id
HAVING COUNT(*) > 1;
```

**Resolution**:
- Verify Redis connectivity
- Check cache TTL settings
- Monitor cache hit rate

---

## 10. Performance Targets

| Target | Metric | How to Measure |
|--------|--------|----------------|
| **DLQ Drain Success >95%** | % messages successfully reprocessed | `drained / (drained + failed)` |
| **Retry Success >90%** | % messages that succeed on retry | Track per event type |
| **MTTR <30 min** | Time from alert to resolution | `resolved_at - incident_declared_at` |
| **Drain Latency <10s** | Time to drain single message | Prometheus histogram |

---

## 11. References

- **IFC-150**: Domain Events Infrastructure (contracts, versioning, outbox)
- **IFC-151**: Event Consumers Framework (retries, DLQ, backoff, observability)
- **ADR-011**: Domain Events Architecture Decision Record
- **Prometheus**: `domain_events_*` metrics
- **Grafana**: DLQ monitoring dashboard
- **Runbook Index**: docs/operations/runbooks/

---

## Appendix: Quick Reference

### Quick Commands

```bash
# Check DLQ depth
psql $DATABASE_URL -c "SELECT COUNT(*) FROM domain_event_outbox WHERE status = 'dead_letter';"

# View failing messages
psql $DATABASE_URL -c "SELECT event_type, COUNT(*), MAX(last_error) FROM domain_event_outbox WHERE status = 'dead_letter' GROUP BY event_type;"

# Trigger drain
curl -X POST http://localhost:3000/admin/dlq/drain -H "Authorization: Bearer $ADMIN_TOKEN"

# Check handler health
curl http://localhost:3000/admin/handlers | jq '.[] | {name, status, latency_ms}'

# Stream logs
kubectl logs -f deployment/api-server -c app | grep -i dlq
```

### On-Call Contacts

- **Tech Lead**: {slack_handle}
- **SRE Lead**: {slack_handle}
- **Backend Team**: #backend-team-oncall
- **Escalation**: @cto-oncall

### Useful Links

- Grafana: https://grafana.local/d/dlq-monitoring
- Loki: https://loki.local/explore
- PagerDuty: https://intelliflow.pagerduty.com/incidents
- GitHub Issues: https://github.com/intelliflow/crm/labels/dlq
