# SLO/SLI Definitions - IntelliFlow CRM

**Document ID**: IFC-142-SLO **Version**: 1.0.0 **Last Updated**: 2025-12-29
**Owner**: STOA-Automation

---

## 1. Overview

This document defines the Service Level Objectives (SLOs) and Service Level
Indicators (SLIs) for IntelliFlow CRM. These metrics establish the reliability
targets and measurement methods for all production services. IntelliFlow CRM is
run by one person (the owner), who is the only audience for this document and
the only person who acts on it.

### 1.1 Definitions

| Term                              | Definition                                                 |
| --------------------------------- | ---------------------------------------------------------- |
| **SLI** (Service Level Indicator) | A quantitative measure of service behavior                 |
| **SLO** (Service Level Objective) | A target value or range for an SLI                         |
| **SLA** (Service Level Agreement) | A contract specifying consequences of meeting/missing SLOs |
| **Error Budget**                  | The acceptable amount of unreliability (100% - SLO)        |

---

## 2. Core Service SLOs

### 2.1 API Availability

| Metric           | Target                               | Measurement Window  |
| ---------------- | ------------------------------------ | ------------------- |
| **SLO**          | 99.9%                                | Rolling 30 days     |
| **SLI**          | Successful requests / Total requests | Per-minute sampling |
| **Error Budget** | 43.2 minutes/month                   | Calculated monthly  |

**Calculation**:

```
Availability = (Total Requests - Failed Requests) / Total Requests * 100

Where Failed Request = HTTP 5xx OR timeout > 30s
```

**Exclusions**:

- Scheduled maintenance windows (announced 48h in advance)
- Client errors (4xx responses)
- Health check endpoints

### 2.2 Response Time (Latency)

| Percentile | Target  | Measurement          |
| ---------- | ------- | -------------------- |
| **p50**    | < 50ms  | Median response time |
| **p95**    | < 200ms | 95th percentile      |
| **p99**    | < 500ms | 99th percentile      |

**SLI Calculation**:

```
Latency SLI = Requests within threshold / Total requests * 100
```

**Measurement Points**:

- Server-side latency (application processing)
- End-to-end latency (client to response)
- Database query latency

### 2.3 Error Rate

| Metric              | Target  | Measurement      |
| ------------------- | ------- | ---------------- |
| **Error Rate**      | < 0.1%  | Rolling 1 hour   |
| **Critical Errors** | < 0.01% | Rolling 24 hours |

**Error Classification**:

- **Critical**: Data loss, security breach, complete service failure
- **Major**: Feature unavailable, degraded performance
- **Minor**: Non-blocking issues, cosmetic problems

---

## 3. Service-Specific SLOs

### 3.1 Authentication Service

| SLO                    | Target  | Error Budget   |
| ---------------------- | ------- | -------------- |
| Availability           | 99.95%  | 21.6 min/month |
| Login latency (p95)    | < 300ms | -              |
| Token validation (p95) | < 50ms  | -              |

### 3.2 Lead Scoring API

| SLO                   | Target              | Error Budget   |
| --------------------- | ------------------- | -------------- |
| Availability          | 99.9%               | 43.2 min/month |
| Scoring latency (p95) | < 2000ms            | -              |
| Batch processing      | < 10s per 100 leads | -              |

### 3.3 Database Layer

| SLO                          | Target | Error Budget  |
| ---------------------------- | ------ | ------------- |
| Availability                 | 99.99% | 4.3 min/month |
| Query latency (p95)          | < 20ms | -             |
| Connection pool availability | 99.9%  | -             |

### 3.4 AI/ML Services

| SLO                     | Target   | Error Budget    |
| ----------------------- | -------- | --------------- |
| Availability            | 99.5%    | 3.6 hours/month |
| Inference latency (p95) | < 2000ms | -               |
| Model accuracy          | > 85%    | -               |

### 3.5 Background Workers

| SLO                    | Target      | Error Budget |
| ---------------------- | ----------- | ------------ |
| Job completion rate    | 99.9%       | -            |
| Queue processing time  | < 5 min p95 | -            |
| Dead letter queue rate | < 0.1%      | -            |

---

## 4. Error Budget Policy

### 4.1 Budget Consumption Thresholds

| Consumed | Status | Action Required                                  |
| -------- | ------ | ------------------------------------------------ |
| 0-50%    | Green  | Normal operations                                |
| 50-75%   | Yellow | Increased monitoring, limit risky deployments    |
| 75-90%   | Orange | Feature freeze, focus on reliability             |
| 90-100%  | Red    | Emergency response, all work goes to reliability |

### 4.2 Budget Reset

- Error budgets reset on the 1st of each month at 00:00 UTC
- Carryover is NOT permitted
- Unused budget does NOT accumulate

### 4.3 Budget Exhaustion Response

When error budget reaches 0%:

1. Halt all non-critical deployments
2. Conduct immediate incident review
3. Implement reliability improvements
4. Resume normal operations only after the owner decides the budget is recovered

---

## 5. Measurement Infrastructure

### 5.1 Data Collection

| Component | Tool                                       | Retention                           |
| --------- | ------------------------------------------ | ----------------------------------- |
| Metrics   | OpenTelemetry export to Grafana Cloud      | Per Grafana Cloud plan (to confirm) |
| Logs      | Railway logs; Grafana Cloud (being set up) | Per plan (to confirm)               |
| Traces    | OpenTelemetry export to Grafana Cloud      | Per Grafana Cloud plan (to confirm) |
| Errors    | Sentry                                     | Per Sentry plan                     |

There are no synthetic tests yet. The Grafana Cloud stack is being set up.

### 5.2 SLO Dashboard

**Location**: Grafana Cloud > SLO Overview Dashboard (to be created)

**Panels**:

- Real-time availability percentage
- Error budget consumption graph
- Latency percentile distribution
- Error rate trend
- Service-by-service breakdown

### 5.3 Alerting Thresholds

| Alert Level      | Trigger Condition                        |
| ---------------- | ---------------------------------------- |
| Email (Critical) | Error budget burn rate > 14.4x for 5 min |
| Email (High)     | Error budget burn rate > 6x for 30 min   |
| Ticket (Medium)  | Error budget burn rate > 3x for 2 hours  |
| Ticket (Low)     | Error budget > 75% consumed              |

All alerts go by email to the owner from Grafana Cloud alerting. Delivery is
proven: the api availability burn-rate alert ("Very High") fired at 2026-11-09
21:24Z and its email arrived at 21:25Z; the "High" one fired at 21:27Z, emailed
21:28Z. There is no paging service.

### 5.4 Production SLOs and the alerts that guard them (verified 2026-11-12)

The SLOs live in Grafana Cloud SLO, defined as code in
`infra/monitoring/grafana/cloud/slos.json` and applied by `grafana-slos.yml`.
The alert rules are `infra/monitoring/grafana/cloud/alert-rules.json` (folder
IntelliFlow production) and `ai-alert-rules.json` (folder IntelliFlow AI
models). Every rule emails the owner.

| SLO (uuid)                                 | Objective                                  | SLI                              | Alerts that fire when it is at risk                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api availability (`env008apiavail`)        | 99.9% / 28 d                               | api server spans without a 5xx   | burn-rate "High" and "Very High" (from the SLO); `ifc032-api-error-rate` (> 5% for 5 min); `ifc074-error-spans-direct` (any error span, fast detection)                                        |
| api latency (`env008apip95`)               | 95% of requests under the threshold / 28 d | api server span duration         | no burn-rate alert of its own (#1001); `ifc032-workflow-p95-latency` (lead routing p95 > 500 ms) covers the critical path; Grafana's `LatencyP95Anomaly` anomaly rule evaluates the api series |
| ai-worker LLM success (`env008llmsuccess`) | 99.5% / 28 d                               | `llm.invoke` spans without error | no burn-rate alert of its own (#1029); `ifc117-inference-error-ratio` (AI chain errors > 5%) and `ifc117-ai-metrics-silent`                                                                    |
| (telemetry itself)                         | spans keep arriving                        | ai-worker span rate              | `ifc032-telemetry-silent` (critical)                                                                                                                                                           |

Supporting rules, not tied to one SLO: `ifc032-lead-routing-failures`,
`ifc032-workflow-error-rate`, `ifc074-error-logs-direct` (error-level log lines
in the combined worker), `ifc117-hallucination-rate`, `ifc117-drift-shift`,
`ifc117-drift-stalled`, `ifc117-inference-p95-latency`. When IFC-151 merges:
`ifc151-outbox-dead-letters` (owner-approved 2026-11-12).

Recovery objectives (IFC-142, `restore-drill-report.md`): the production
database is backed up daily at 03:30 (`runbooks/database-backup.md`), so the RPO
is at most about 24 h; restoring that file took about 12 s on 2026-11-12 (RTO
target: under 1 hour).

---

## 6. Reporting Cadence

| Report             | Frequency      | Audience |
| ------------------ | -------------- | -------- |
| SLO Status         | Real-time      | Owner    |
| Weekly Summary     | Every Monday   | Owner    |
| Monthly Review     | 1st of month   | Owner    |
| Quarterly Analysis | End of quarter | Owner    |

### 6.1 Monthly SLO Review Agenda

1. SLO performance summary (5 min)
2. Error budget consumption analysis (10 min)
3. Incident correlation review (15 min)
4. Reliability improvement proposals (20 min)
5. Next month targets and adjustments (10 min)

---

## 7. SLO Governance

### 7.1 Change Process

SLO changes require:

1. Written proposal with justification
2. Impact analysis on dependent services
3. Review by the owner
4. Documentation update

### 7.2 Exception Handling

Temporary SLO exceptions may be granted for:

- Major version upgrades
- Infrastructure migrations
- Known external dependencies issues

Exceptions require:

- Written approval from the owner
- Maximum duration of 7 days
- Post-exception review

---

## 8. Appendix

### 8.1 SLI Query Examples

**Availability SLI (Prometheus)**:

```promql
sum(rate(http_requests_total{status!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

**Latency SLI (Prometheus)**:

```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

**Error Rate SLI (Prometheus)**:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

### 8.2 Related Documents

- [Alerts Configuration](../infra/monitoring/alerts-config.yaml)
- [Incident Runbook](./incident-runbook.md)
- [Monitoring Runbook](./runbooks/monitoring-runbook.md)

---

**Document History**: | Version | Date | Author | Changes |
|---------|------|--------|---------| | 1.0.0 | 2025-12-29 | STOA-Automation |
Initial release |
