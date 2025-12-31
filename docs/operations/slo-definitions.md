# SLO/SLI Definitions - IntelliFlow CRM

**Document ID**: IFC-142-SLO
**Version**: 1.0.0
**Last Updated**: 2025-12-29
**Owner**: STOA-Automation

---

## 1. Overview

This document defines the Service Level Objectives (SLOs) and Service Level Indicators (SLIs) for IntelliFlow CRM. These metrics establish the reliability targets and measurement methods for all production services.

### 1.1 Definitions

| Term | Definition |
|------|------------|
| **SLI** (Service Level Indicator) | A quantitative measure of service behavior |
| **SLO** (Service Level Objective) | A target value or range for an SLI |
| **SLA** (Service Level Agreement) | A contract specifying consequences of meeting/missing SLOs |
| **Error Budget** | The acceptable amount of unreliability (100% - SLO) |

---

## 2. Core Service SLOs

### 2.1 API Availability

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| **SLO** | 99.9% | Rolling 30 days |
| **SLI** | Successful requests / Total requests | Per-minute sampling |
| **Error Budget** | 43.2 minutes/month | Calculated monthly |

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

| Percentile | Target | Measurement |
|------------|--------|-------------|
| **p50** | < 50ms | Median response time |
| **p95** | < 200ms | 95th percentile |
| **p99** | < 500ms | 99th percentile |

**SLI Calculation**:
```
Latency SLI = Requests within threshold / Total requests * 100
```

**Measurement Points**:
- Server-side latency (application processing)
- End-to-end latency (client to response)
- Database query latency

### 2.3 Error Rate

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Error Rate** | < 0.1% | Rolling 1 hour |
| **Critical Errors** | < 0.01% | Rolling 24 hours |

**Error Classification**:
- **Critical**: Data loss, security breach, complete service failure
- **Major**: Feature unavailable, degraded performance
- **Minor**: Non-blocking issues, cosmetic problems

---

## 3. Service-Specific SLOs

### 3.1 Authentication Service

| SLO | Target | Error Budget |
|-----|--------|--------------|
| Availability | 99.95% | 21.6 min/month |
| Login latency (p95) | < 300ms | - |
| Token validation (p95) | < 50ms | - |

### 3.2 Lead Scoring API

| SLO | Target | Error Budget |
|-----|--------|--------------|
| Availability | 99.9% | 43.2 min/month |
| Scoring latency (p95) | < 2000ms | - |
| Batch processing | < 10s per 100 leads | - |

### 3.3 Database Layer

| SLO | Target | Error Budget |
|-----|--------|--------------|
| Availability | 99.99% | 4.3 min/month |
| Query latency (p95) | < 20ms | - |
| Connection pool availability | 99.9% | - |

### 3.4 AI/ML Services

| SLO | Target | Error Budget |
|-----|--------|--------------|
| Availability | 99.5% | 3.6 hours/month |
| Inference latency (p95) | < 2000ms | - |
| Model accuracy | > 85% | - |

### 3.5 Background Workers

| SLO | Target | Error Budget |
|-----|--------|--------------|
| Job completion rate | 99.9% | - |
| Queue processing time | < 5 min p95 | - |
| Dead letter queue rate | < 0.1% | - |

---

## 4. Error Budget Policy

### 4.1 Budget Consumption Thresholds

| Consumed | Status | Action Required |
|----------|--------|-----------------|
| 0-50% | Green | Normal operations |
| 50-75% | Yellow | Increased monitoring, limit risky deployments |
| 75-90% | Orange | Feature freeze, focus on reliability |
| 90-100% | Red | Emergency response, all hands on reliability |

### 4.2 Budget Reset

- Error budgets reset on the 1st of each month at 00:00 UTC
- Carryover is NOT permitted
- Unused budget does NOT accumulate

### 4.3 Budget Exhaustion Response

When error budget reaches 0%:
1. Halt all non-critical deployments
2. Conduct immediate incident review
3. Implement reliability improvements
4. Resume normal operations only after executive approval

---

## 5. Measurement Infrastructure

### 5.1 Data Collection

| Component | Tool | Retention |
|-----------|------|-----------|
| Metrics | Prometheus / OpenTelemetry | 90 days |
| Logs | Grafana Loki | 30 days |
| Traces | Jaeger / Tempo | 14 days |
| Synthetic Tests | Checkly / Pingdom | 365 days |

### 5.2 SLO Dashboard

**Location**: Grafana > SLO Overview Dashboard

**Panels**:
- Real-time availability percentage
- Error budget consumption graph
- Latency percentile distribution
- Error rate trend
- Service-by-service breakdown

### 5.3 Alerting Thresholds

| Alert Level | Trigger Condition |
|-------------|-------------------|
| Page (Critical) | Error budget burn rate > 14.4x for 5 min |
| Page (High) | Error budget burn rate > 6x for 30 min |
| Ticket (Medium) | Error budget burn rate > 3x for 2 hours |
| Ticket (Low) | Error budget > 75% consumed |

---

## 6. Reporting Cadence

| Report | Frequency | Audience |
|--------|-----------|----------|
| SLO Status | Real-time | Engineering |
| Weekly Summary | Every Monday | Engineering + Product |
| Monthly Review | 1st of month | Leadership |
| Quarterly Analysis | End of quarter | Executive Team |

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
3. Stakeholder review (Engineering + Product)
4. 2-week notice before implementation
5. Documentation update

### 7.2 Exception Handling

Temporary SLO exceptions may be granted for:
- Major version upgrades
- Infrastructure migrations
- Known external dependencies issues

Exceptions require:
- Written approval from Engineering Lead
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

- [Alerts Configuration](../artifacts/misc/alerts-config.yaml)
- [Incident Runbook](./incident-runbook.md)
- [On-Call Schedule](../artifacts/misc/oncall-schedule.json)
- [Monitoring Runbook](./monitoring-runbook.md)

---

**Document History**:
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-29 | STOA-Automation | Initial release |
