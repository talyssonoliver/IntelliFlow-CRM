# Incident Response Runbook - IntelliFlow CRM

**Document ID**: IFC-142-INCIDENT
**Version**: 1.0.0
**Last Updated**: 2025-12-29
**Owner**: STOA-Automation

---

## 1. Overview

This runbook provides standardized procedures for responding to incidents affecting IntelliFlow CRM services. All on-call engineers must be familiar with these procedures.

### 1.1 Incident Definition

An **incident** is any unplanned interruption to service or reduction in service quality that impacts users or business operations.

### 1.2 Severity Levels

| Level | Name | Definition | Response Time | Resolution Target |
|-------|------|------------|---------------|-------------------|
| **P1** | Critical | Complete service outage, data loss, security breach | 5 min | 1 hour |
| **P2** | High | Major feature unavailable, significant degradation | 15 min | 4 hours |
| **P3** | Medium | Minor feature issue, performance degradation | 1 hour | 24 hours |
| **P4** | Low | Cosmetic issues, minor bugs | 8 hours | 1 week |

---

## 2. Incident Response Process

### 2.1 Phase 1: Detection & Alert (0-5 minutes)

#### Automated Detection
1. Monitoring system detects anomaly
2. Alert fires to PagerDuty/Slack
3. On-call engineer receives notification

#### Manual Detection
1. User reports issue via support channels
2. Support escalates to engineering
3. On-call engineer is paged

#### First Response Actions
```
[ ] Acknowledge the alert within SLA (P1: 5min, P2: 15min)
[ ] Open incident channel: /incident-open in Slack
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
- [ ] >10% of users affected
- [ ] Business operations impacted

**P3 Indicators**:
- [ ] Minor feature issues
- [ ] <10% users affected
- [ ] Workaround available
- [ ] No data impact

#### Escalation Decision
```
IF severity >= P2:
    [ ] Escalate to team lead
    [ ] Notify stakeholders
    [ ] Consider incident commander

IF severity = P1:
    [ ] Immediate escalation to all hands
    [ ] Notify leadership
    [ ] Activate war room
```

### 2.3 Phase 3: Mitigation (15-60 minutes)

#### Quick Wins (Try First)
```
1. [ ] Restart affected service(s)
2. [ ] Rollback recent deployment
3. [ ] Scale up resources
4. [ ] Disable problematic feature flag
5. [ ] Failover to backup region
```

#### Common Scenarios

##### API High Error Rate
```bash
# Check error logs
kubectl logs -l app=api --tail=1000 | grep ERROR

# Check recent deployments
kubectl rollout history deployment/api

# Rollback if needed
kubectl rollout undo deployment/api

# Scale up if load issue
kubectl scale deployment/api --replicas=5
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
# Identify resource hogs
kubectl top pods --sort-by=memory

# Force pod restart
kubectl delete pod <pod-name>

# Check for memory leaks
kubectl logs <pod-name> | grep -i "heap\|memory"
```

##### AI Service Degradation
```bash
# Check AI worker status
curl http://ai-worker:3000/health

# Check model load status
curl http://ai-worker:3000/models/status

# Fallback to simpler model
curl -X POST http://ai-worker:3000/config -d '{"model": "fallback"}'
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
[ ] Timeline of events in incident channel
[ ] Actions taken and results
[ ] Root cause hypothesis
[ ] Temporary vs permanent fix distinction
```

### 2.5 Phase 5: Post-Incident (24-72 hours)

#### Immediate Actions
```
[ ] Update status page to resolved
[ ] Notify stakeholders of resolution
[ ] Create post-incident ticket
[ ] Schedule post-mortem (within 72 hours for P1/P2)
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
| Time (UTC) | Event |
|------------|-------|
| HH:MM | Alert triggered |
| HH:MM | Engineer acknowledged |
| HH:MM | Mitigation applied |
| HH:MM | Resolved |

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
| ID | Action | Owner | Due Date | Status |
|----|--------|-------|----------|--------|
| 1  |        |       |          |        |

## Lessons Learned
1.
2.
```

---

## 3. Communication Templates

### 3.1 Initial Notification (P1/P2)
```
:rotating_light: INCIDENT DECLARED

Severity: P[X]
Service(s): [affected services]
Impact: [user impact description]
Status: Investigating

Incident Commander: @[name]
Incident Channel: #incident-[id]

Next update in 15 minutes.
```

### 3.2 Status Update
```
:yellow_circle: INCIDENT UPDATE

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
:large_green_circle: INCIDENT RESOLVED

Severity: P[X]
Service(s): [affected services]
Duration: [X hours/minutes]
Status: Resolved

Root Cause: [brief description]
Resolution: [what fixed it]

Post-mortem scheduled for [date/time].
Full timeline will be shared in #incidents.
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
IntelliFlow CRM Team
```

---

## 4. Role Definitions

### 4.1 Incident Commander (IC)
**Responsibilities**:
- Coordinate response efforts
- Make severity and escalation decisions
- Communicate with stakeholders
- Assign tasks to responders
- Ensure documentation

**Who**: Senior engineer or designated IC rotation

### 4.2 Technical Lead
**Responsibilities**:
- Lead technical investigation
- Direct debugging efforts
- Make technical decisions on mitigation
- Validate fixes

**Who**: Most experienced engineer for affected system

### 4.3 Communications Lead
**Responsibilities**:
- Update status page
- Draft customer communications
- Manage Slack updates
- Coordinate with support team

**Who**: Support lead or designated comms person

### 4.4 Scribe
**Responsibilities**:
- Document timeline in real-time
- Record all actions taken
- Capture decisions and rationale
- Prepare post-mortem draft

**Who**: Any available engineer not actively debugging

---

## 5. Tool Reference

### 5.1 Monitoring & Observability
| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | https://grafana.intelliflow.io | Dashboards, metrics |
| Prometheus | https://prometheus.intelliflow.io | Metrics queries |
| Loki | https://grafana.intelliflow.io/explore | Log search |
| Jaeger | https://jaeger.intelliflow.io | Distributed tracing |
| Sentry | https://sentry.io/intelliflow | Error tracking |

### 5.2 Infrastructure
| Tool | URL/Access | Purpose |
|------|------------|---------|
| Kubernetes | `kubectl` | Container orchestration |
| AWS Console | https://console.aws.amazon.com | Cloud resources |
| Supabase | https://app.supabase.com | Database |
| Vercel | https://vercel.com/intelliflow | Deployments |

### 5.3 Communication
| Tool | Channel | Purpose |
|------|---------|---------|
| Slack | #incidents | Active incidents |
| Slack | #oncall | On-call coordination |
| PagerDuty | intelliflow | Alerting, escalation |
| Status Page | status.intelliflow.io | Public status |

### 5.4 Useful Commands

```bash
# Kubernetes
kubectl get pods -A | grep -v Running
kubectl describe pod <pod-name>
kubectl logs -f <pod-name> --tail=100
kubectl rollout status deployment/<name>
kubectl rollout undo deployment/<name>

# Database
psql -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"
psql -c "SELECT pg_cancel_backend(pid);"

# Network
curl -I https://api.intelliflow.io/health
dig api.intelliflow.io
traceroute api.intelliflow.io

# Logs
kubectl logs -l app=api --since=1h | jq '.level == "error"'
```

---

## 6. Escalation Contacts

### 6.1 Engineering
| Role | Name | Contact |
|------|------|---------|
| CTO | [Name] | @cto / +1-XXX-XXX-XXXX |
| VP Engineering | [Name] | @vpe / +1-XXX-XXX-XXXX |
| Engineering Manager | [Name] | @em / +1-XXX-XXX-XXXX |

### 6.2 External Dependencies
| Vendor | Support Contact | SLA |
|--------|-----------------|-----|
| AWS | aws.amazon.com/support | Enterprise |
| Supabase | support@supabase.io | Pro |
| Vercel | support@vercel.com | Pro |
| OpenAI | help.openai.com | Tier 4 |
| PagerDuty | support@pagerduty.com | Standard |

### 6.3 Emergency Actions
| Action | Authority Required | Contact |
|--------|-------------------|---------|
| Rollback | On-call engineer | Self |
| Scale infrastructure | On-call engineer | Self |
| Region failover | Engineering Manager | @em |
| Data restoration | DBA + EM approval | #database |
| Security response | Security team | @security |

---

## 7. Appendix

### 7.1 Incident Severity Matrix

| Impact | Users Affected | Duration | Data Risk | Severity |
|--------|---------------|----------|-----------|----------|
| Total outage | All | Any | Any | P1 |
| Partial outage | >50% | >15 min | None | P1 |
| Major feature down | >10% | >30 min | None | P2 |
| Performance issue | Any | >1 hour | None | P2 |
| Minor feature issue | <10% | Any | None | P3 |
| UI/UX issue | Any | Any | None | P4 |

### 7.2 Error Budget Quick Reference

| Service | Monthly Budget | Current Status |
|---------|---------------|----------------|
| API | 43.2 min | [Check Grafana] |
| Auth | 21.6 min | [Check Grafana] |
| AI Worker | 3.6 hours | [Check Grafana] |
| Database | 4.3 min | [Check Grafana] |

### 7.3 Related Documents
- [SLO Definitions](./slo-definitions.md)
- [On-Call Schedule](../artifacts/misc/oncall-schedule.json)
- [Alerts Configuration](../artifacts/misc/alerts-config.yaml)
- [Monitoring Runbook](./monitoring-runbook.md)
- [Release & Rollback](./release-rollback.md)

---

**Document History**:
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-29 | STOA-Automation | Initial release |
