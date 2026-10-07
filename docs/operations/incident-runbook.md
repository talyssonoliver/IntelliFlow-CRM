# Incident Response Runbook - IntelliFlow CRM

**Document ID**: IFC-142-INCIDENT **Version**: 1.0.0 **Last Updated**:
2025-12-29 **Owner**: STOA-Automation

---

## 1. Overview

This runbook provides standardized procedures for responding to incidents
affecting IntelliFlow CRM services. IntelliFlow CRM is run by one person (the
owner), who is the only responder. Every role in this document (incident
commander, technical lead, communications, scribe) is played by the owner.

Production layout, for reference:

- API, ai-worker, three workers (events, ingestion, notifications) and Redis on
  Railway
- Web on Vercel
- Postgres on Supabase (Supabase-managed backups)
- Errors in Sentry
- OpenTelemetry export to a hosted Grafana Cloud stack (being set up)
- Alerts by email to the owner from Grafana Cloud alerting (being set up, not
  yet proven)

### 1.1 Incident Definition

An **incident** is any unplanned interruption to service or reduction in service
quality that impacts users or business operations.

### 1.2 Severity Levels

| Level  | Name     | Definition                                          | Response Time | Resolution Target |
| ------ | -------- | --------------------------------------------------- | ------------- | ----------------- |
| **P1** | Critical | Complete service outage, data loss, security breach | 5 min         | 1 hour            |
| **P2** | High     | Major feature unavailable, significant degradation  | 15 min        | 4 hours           |
| **P3** | Medium   | Minor feature issue, performance degradation        | 1 hour        | 24 hours          |
| **P4** | Low      | Cosmetic issues, minor bugs                         | 8 hours       | 1 week            |

---

## 2. Incident Response Process

### 2.1 Phase 1: Detection & Alert (0-5 minutes)

#### Automated Detection

1. Monitoring system detects anomaly
2. An alert email arrives from Grafana Cloud alerting (once set up), or an error
   appears in Sentry
3. The owner reads the alert

#### Manual Detection

1. A user reports an issue
2. The owner picks it up directly

#### First Response Actions

```
[ ] Acknowledge the alert within SLA (P1: 5min, P2: 15min)
[ ] Start a timeline (a note or an issue) with the alert time
[ ] Verify the alert is valid (not false positive)
[ ] Assess initial severity level
```

### 2.2 Phase 2: Triage (5-15 minutes)

#### Gather Information

```
[ ] What service(s) are affected?
[ ] When did the issue start?
[ ] What changed recently? (deployments, config, external deps)
[ ] How many users are affected?
[ ] Is there data loss or security implications?
```

#### Severity Assessment Checklist

**P1 Indicators**:

- [ ] Complete service outage (>50% error rate)
- [ ] Data corruption or loss
- [ ] Security breach detected
- [ ] All users affected
- [ ] Revenue-impacting

**P2 Indicators**:

- [ ] Major feature unavailable
- [ ] Significant performance degradation (>500ms p95)
- [ ] > 10% of users affected
- [ ] Business operations impacted

**P3 Indicators**:

- [ ] Minor feature issues
- [ ] <10% users affected
- [ ] Workaround available
- [ ] No data impact

#### Escalation Decision

There is nobody to escalate to. The owner decides how much to drop based on
severity:

```
IF severity >= P2:
    [ ] Stop other work and focus on the incident
    [ ] Notify affected users if they are known

IF severity = P1:
    [ ] Mitigate first (rollback, restart), investigate second
    [ ] Notify affected users once mitigated
```

### 2.3 Phase 3: Mitigation (15-60 minutes)

#### Quick Wins (Try First)

```
1. [ ] Restart affected service(s) (Railway dashboard: redeploy)
2. [ ] Rollback recent deployment (Railway or Vercel previous deployment)
3. [ ] Scale up resources (Railway service settings)
4. [ ] Disable problematic feature flag
```

#### Common Scenarios

##### API High Error Rate

```bash
# Check error logs (Railway CLI, linked to the production environment)
railway logs --service api | grep ERROR

# Check recent deployments: Railway dashboard > api > Deployments
# Rollback if needed: redeploy the previous successful deployment from the
# same page

# Scale up if load issue: raise resource limits in Railway service settings
```

##### Database Connection Issues

```bash
# Check connection pool
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE state = 'idle' AND query_start < now() - interval '30 minutes';"

# Check for locks
psql -c "SELECT * FROM pg_locks WHERE granted = false;"
```

##### High Memory/CPU

```bash
# Identify resource hogs: Railway dashboard > service > Metrics

# Force a restart: redeploy the service from the Railway dashboard

# Check for memory leaks
railway logs --service <service-name> | grep -i "heap\|memory"
```

##### AI Service Degradation

```bash
# Check AI worker status
curl http://ai-worker:5000/health

# Check detailed dependency health
curl http://ai-worker:5000/health/detailed

# Check queue dashboard
curl -I http://ai-worker:3003/queues
```

### 2.4 Phase 4: Resolution (Variable)

#### Verification Steps

```
[ ] Error rates returned to normal (<0.1%)
[ ] Latency within SLO (p95 <200ms)
[ ] All health checks passing
[ ] User reports ceased
[ ] Monitoring shows stable metrics
```

#### Documentation During Incident

```
[ ] Timeline of events
[ ] Actions taken and results
[ ] Root cause hypothesis
[ ] Temporary vs permanent fix distinction
```

### 2.5 Phase 5: Post-Incident (24-72 hours)

#### Immediate Actions

```
[ ] Notify affected users of resolution
[ ] Create post-incident ticket
[ ] Write the post-mortem (within 72 hours for P1/P2)
```

#### Post-Mortem Template

```markdown
# Incident Post-Mortem: [INCIDENT-ID]

## Summary

- Date/Time:
- Duration:
- Severity:
- Services Affected:
- Users Impacted:

## Timeline

| Time (UTC) | Event              |
| ---------- | ------------------ |
| HH:MM      | Alert triggered    |
| HH:MM      | Owner acknowledged |
| HH:MM      | Mitigation applied |
| HH:MM      | Resolved           |

## Root Cause

[Detailed technical explanation]

## Contributing Factors

1.
2.
3.

## Impact

- Revenue: $X
- Users affected: N
- Error budget consumed: X%

## What Went Well

1.
2.

## What Went Wrong

1.
2.

## Action Items

| ID  | Action | Due Date | Status |
| --- | ------ | -------- | ------ |
| 1   |        |          |        |

## Lessons Learned

1.
2.
```

---

## 3. Communication Templates

There is no status page and no incident channel. Communication goes by email to
affected users, sent by the owner.

### 3.1 Initial Notification (P1/P2)

```
INCIDENT DECLARED

Severity: P[X]
Service(s): [affected services]
Impact: [user impact description]
Status: Investigating

Next update in 15 minutes.
```

### 3.2 Status Update

```
INCIDENT UPDATE

Severity: P[X]
Service(s): [affected services]
Status: [Investigating/Mitigating/Monitoring]

Update: [what's changed]

Current Actions:
- [action 1]
- [action 2]

Next update in [X] minutes.
```

### 3.3 Resolution Notification

```
INCIDENT RESOLVED

Severity: P[X]
Service(s): [affected services]
Duration: [X hours/minutes]
Status: Resolved

Root Cause: [brief description]
Resolution: [what fixed it]

Post-mortem: [date/time or link]
```

### 3.4 Customer Communication (P1)

```
Subject: Service Disruption - [Date]

Dear Customer,

We experienced a service disruption affecting [service]
from [start time] to [end time] UTC.

What happened:
[Non-technical explanation]

Impact:
[What users experienced]

Resolution:
[What we did to fix it]

Prevention:
[What we're doing to prevent recurrence]

We apologize for any inconvenience this caused.

Best regards,
IntelliFlow CRM
```

---

## 4. Roles

IntelliFlow CRM has a single operator. The owner does all of the following.

### 4.1 Incident Commander

- Coordinate the response
- Make severity decisions
- Decide when to roll back

### 4.2 Technical Lead

- Lead the technical investigation
- Make technical decisions on mitigation
- Validate fixes

### 4.3 Communications

- Draft and send customer communications by email

### 4.4 Scribe

- Keep the timeline as the incident runs
- Record actions taken and the reasoning
- Write the post-mortem

---

## 5. Tool Reference

### 5.1 Monitoring & Observability

| Tool          | Access                       | Purpose                                   |
| ------------- | ---------------------------- | ----------------------------------------- |
| Grafana Cloud | Hosted stack (being set up)  | Dashboards, metrics, logs, traces, alerts |
| Sentry        | https://sentry.io            | Error tracking                            |
| Railway       | Dashboard and `railway logs` | Service logs and metrics for API, workers |
| Vercel        | Dashboard                    | Web deployment logs                       |

### 5.2 Infrastructure

| Tool     | URL/Access               | Purpose                                                           |
| -------- | ------------------------ | ----------------------------------------------------------------- |
| Railway  | https://railway.app      | API, ai-worker, workers (events, ingestion, notifications), Redis |
| Supabase | https://app.supabase.com | Postgres database and managed backups                             |
| Vercel   | https://vercel.com       | Web deployments                                                   |

### 5.3 Alerting

| Tool                   | Channel            | Purpose                               |
| ---------------------- | ------------------ | ------------------------------------- |
| Grafana Cloud alerting | Email to the owner | Alerts (being set up, not yet proven) |

### 5.4 Useful Commands

```bash
# Railway
railway status
railway logs --service <name>

# Database
psql -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"
psql -c "SELECT pg_cancel_backend(pid);"

# Network
curl -I https://api.intelliflow.io/health
dig api.intelliflow.io
traceroute api.intelliflow.io

# Logs
railway logs --service api | jq 'select(.level == "error")'
```

---

## 6. Escalation and External Dependencies

### 6.1 Escalation

| Role  | Contact             |
| ----- | ------------------- |
| Owner | Via the alert email |

There is no on-call rotation, no manager and no security team. The owner handles
every incident, including security response and data restoration.

### 6.2 External Dependencies

| Vendor        | Support Contact                 |
| ------------- | ------------------------------- |
| Railway       | Railway dashboard support       |
| Supabase      | Supabase dashboard support      |
| Vercel        | Vercel dashboard support        |
| OpenAI        | help.openai.com                 |
| Grafana Cloud | Grafana Cloud dashboard support |
| Sentry        | Sentry dashboard support        |

### 6.3 Emergency Actions

| Action               | Authority Required | Notes                                      |
| -------------------- | ------------------ | ------------------------------------------ |
| Rollback             | Owner              | Railway or Vercel previous deployment      |
| Scale infrastructure | Owner              | Railway service settings                   |
| Data restoration     | Owner              | Supabase-managed backups                   |
| Security response    | Owner              | Rotate credentials, review Sentry and logs |

---

## 7. Appendix

### 7.1 Incident Severity Matrix

| Impact              | Users Affected | Duration | Data Risk | Severity |
| ------------------- | -------------- | -------- | --------- | -------- |
| Total outage        | All            | Any      | Any       | P1       |
| Partial outage      | >50%           | >15 min  | None      | P1       |
| Major feature down  | >10%           | >30 min  | None      | P2       |
| Performance issue   | Any            | >1 hour  | None      | P2       |
| Minor feature issue | <10%           | Any      | None      | P3       |
| UI/UX issue         | Any            | Any      | None      | P4       |

### 7.2 Error Budget Quick Reference

| Service   | Monthly Budget | Current Status  |
| --------- | -------------- | --------------- |
| API       | 43.2 min       | [Check Grafana] |
| Auth      | 21.6 min       | [Check Grafana] |
| AI Worker | 3.6 hours      | [Check Grafana] |
| Database  | 4.3 min        | [Check Grafana] |

### 7.3 Related Documents

- [SLO Definitions](./slo-definitions.md)
- [Alerts Configuration](../infra/monitoring/alerts-config.yaml)
- [Monitoring Runbook](./runbooks/monitoring-runbook.md)
- [Release & Rollback](./release-rollback.md)

---

**Document History**: | Version | Date | Author | Changes |
|---------|------|--------|---------| | 1.0.0 | 2025-12-29 | STOA-Automation |
Initial release |
