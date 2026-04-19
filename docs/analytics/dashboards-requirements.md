# Dashboard Requirements — IntelliFlow CRM

**Purpose**: Define the required dashboards, their KPIs, data sources, and
non-functional constraints for the analytics layer of IntelliFlow CRM. This
document is the specification input for `docs/analytics/rfm-abc-spec.md` and the
`IFC-*` analytics tasks in Sprint_plan.csv.

---

## Goals

- Track pipeline health and CRM data quality in real time
- Measure automation impact with before/after evidence
- Provide actionable insights per persona (Founder, Sales, RevOps, Engineering)
- Enable governance-grade auditability — every metric traceable to a source

---

## Required Dashboards

### 1. Pipeline Overview

**Audience**: Founder/GM, Sales Lead  
**Refresh**: Near-real-time (≤ 5 min lag)  
**Key metrics**:

| Metric                  | Definition                                     | Source table         |
| ----------------------- | ---------------------------------------------- | -------------------- |
| Total open deals        | Deals with `status = 'OPEN'`                   | `deals`              |
| Pipeline value ($)      | Sum of `expected_value` on open deals          | `deals`              |
| Deals by stage          | Count per `pipeline_stage`                     | `deals`              |
| Stage conversion rate   | Deals moved in / deals entered per stage (30d) | `deal_stage_history` |
| Average deal age (days) | `NOW() - created_at` for open deals            | `deals`              |

### 2. Activity & Follow-Up Compliance

**Audience**: Sales Lead, RevOps  
**Refresh**: Daily  
**Key metrics**:

| Metric                    | Definition                                       | Source       |
| ------------------------- | ------------------------------------------------ | ------------ |
| Follow-up compliance rate | Tasks completed on time / tasks due (7d rolling) | `tasks`      |
| Overdue follow-ups        | Open tasks past `due_date`                       | `tasks`      |
| Activity volume           | Calls + emails + meetings logged per rep (7d)    | `activities` |
| Stale contacts            | Contacts with no activity in >90 days            | `contacts`   |
| Data completeness score   | % required fields populated per entity type      | derived      |

### 3. Automation Throughput & Outcomes

**Audience**: RevOps, Engineering Lead  
**Refresh**: Near-real-time  
**Key metrics**:

| Metric                     | Definition                                     | Source                |
| -------------------------- | ---------------------------------------------- | --------------------- |
| Automation jobs run (24h)  | Count of completed `automation_job` records    | `automation_jobs`     |
| Success rate               | `status = 'SUCCESS'` / total jobs (24h)        | `automation_jobs`     |
| Human-in-the-loop triggers | Jobs that paused for approval                  | `automation_jobs`     |
| DLQ depth                  | Unprocessed messages in dead-letter queue      | `domain_event_outbox` |
| P95 job duration           | 95th-percentile execution time across all jobs | `automation_jobs`     |

### 4. Segmentation Coverage (RFM / ABC)

**Audience**: RevOps, Sales Lead  
**Refresh**: Daily (segment recalculation batch)  
**Key metrics**: see `docs/analytics/rfm-abc-spec.md` for segment definitions

| Metric                    | Definition                                              |
| ------------------------- | ------------------------------------------------------- |
| % accounts with RFM score | Accounts with non-null `rfm_segment` / total accounts   |
| Segment distribution      | Count per `rfm_segment` label (Champion, At Risk, etc.) |
| ABC coverage              | % accounts classified A / B / C                         |
| Segment movement (30d)    | Accounts that changed segment in last 30 days           |

---

## Non-Functional Requirements

| Requirement        | Target                                                          |
| ------------------ | --------------------------------------------------------------- |
| Privacy-first      | No PII in dashboard metric tables; aggregate only in log stores |
| Clear definitions  | Every metric must have a `definition` column in the UI tooltip  |
| Query performance  | Dashboard load < 2s for all views (p95)                         |
| Data freshness SLO | Real-time dashboards: ≤ 5 min; daily dashboards: ≤ 25 hours     |
| Access control     | Role-based — Sales reps see their own data; managers see all    |
| Audit log          | Dashboard filter/export actions logged with user + timestamp    |

---

## Implementation Notes

- Dashboards are built on the `apps/web` frontend using the tRPC analytics
  router (IFC analytics tasks).
- Real-time metrics use Supabase Realtime or a polling pattern — decision in ADR
  to be authored.
- Segmentation recalculation is a scheduled job in `apps/ai-worker`.

---

## TODO: to be authored

- Wireframe / mockup links (Figma)
- Export and scheduling requirements (PDF reports, email digests)
- Alerting rules tied to dashboard thresholds
- Historical trend analysis requirements (>90d lookback)

---

**Owner**: PM + Engineering Lead  
**Last reviewed**: 2026-04-16  
**Related**: `docs/analytics/rfm-abc-spec.md`,
`docs/operations/slo-definitions.md`
