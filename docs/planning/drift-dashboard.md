# AI Model Drift Dashboard

**Task**: IFC-117 - Monitor AI models for drift, latency, hallucination and ROI
**Decision**: ADR-088 (AI model monitoring through the OTel global meter)
**Status**: committed, production unverified (Needs Human, evidence N1-N7 below)

This page describes what ai-worker records, where the dashboard and alert rules
live, and what the numbers do and do not mean. It contains no measured values:
nothing has been measured in production yet.

---

## Canonical files

| What                    | File                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| Recording facade        | `apps/ai-worker/src/monitoring/otel-ai-metrics.ts`                  |
| Instruments and labels  | `apps/ai-worker/src/monitoring/otel-ai-types.ts`                    |
| Drift statistics        | `apps/ai-worker/src/monitoring/drift-stats.ts`                      |
| Drift detector          | `apps/ai-worker/src/monitoring/drift-detector.ts`                   |
| Drift scheduler         | `apps/ai-worker/src/monitoring/drift-scheduler.ts`                  |
| Call-site instrumenting | `apps/ai-worker/src/monitoring/chain-monitor.ts` (`withMonitoring`) |
| Dashboard               | `infra/monitoring/grafana/cloud/dashboard-ai-models.json`           |
| Alert rules             | `infra/monitoring/grafana/cloud/ai-alert-rules.json`                |
| Alert apply script      | `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs`      |
| Alert apply workflow    | `.github/workflows/grafana-ai-alert-rules.yml`                      |

**Superseded** (kept on disk, owned by other tasks; retirement is a follow-up
issue): `infra/monitoring/ai-grafana-dashboard.json`,
`infra/monitoring/ai-prometheus-rules.yaml`,
`infra/monitoring/alerts-config.yaml`. They query metric names nothing emits.
The old `apps/ai-worker/src/metrics/prometheus-exporter.ts` was deleted: it was
never mounted, so it exported nothing.

---

## How the metrics reach Grafana

ai-worker's NodeSDK registers the global OTel MeterProvider, which exports over
OTLP to Grafana Cloud. The facade takes its meter from that global provider; it
never creates a second provider. Every recorder is fail-open: a metrics error is
logged and swallowed, never thrown into a chain.

`withMonitoring` records each monitored chain call on both its success and error
paths. Today the only monitored chain with a production caller is lead scoring.

### Instruments

The Prometheus names assume Grafana's OTLP translation (dots to underscores,
`_total` on counters, `_milliseconds` for `ms`). The post-deploy dry run of the
alert workflow is the real check (N5).

| OTel instrument                         | Prometheus series                                 | Labels                                     |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `intelliflow.ai.inference.latency` (ms) | `intelliflow_ai_inference_latency_milliseconds_*` | model, chain, outcome                      |
| `intelliflow.ai.inference.count`        | `intelliflow_ai_inference_count_total`            | model, chain, outcome, error_class (error) |
| `intelliflow.ai.confidence`             | `intelliflow_ai_confidence_*`                     | model, chain                               |
| `intelliflow.ai.cost.usd`               | `intelliflow_ai_cost_usd_total`                   | model, chain                               |
| `intelliflow.ai.value.estimated.usd`    | `intelliflow_ai_value_estimated_usd_total`        | chain, value_type                          |
| `intelliflow.ai.hallucination.checks`   | `intelliflow_ai_hallucination_checks_total`       | model, chain                               |
| `intelliflow.ai.hallucination.detected` | `intelliflow_ai_hallucination_detected_total`     | model, chain                               |
| `intelliflow.ai.hallucination.types`    | `intelliflow_ai_hallucination_types_total`        | model, chain, hallucination_type           |
| `intelliflow.ai.hallucination.skipped`  | `intelliflow_ai_hallucination_skipped_total`      | chain, reason                              |
| `intelliflow.ai.drift.score`            | `intelliflow_ai_drift_score`                      | model, metric                              |
| `intelliflow.ai.drift.detections`       | `intelliflow_ai_drift_detections_total`           | model, metric, severity                    |
| `intelliflow.ai.drift.checks`           | `intelliflow_ai_drift_checks_total`               | status                                     |
| `intelliflow.ai.drift.last_check`       | `intelliflow_ai_drift_last_check`                 | none                                       |
| `intelliflow.ai.retraining.triggers`    | `intelliflow_ai_retraining_triggers_total`        | urgency                                    |

### Label allowlist

Every label value comes from a closed list in `otel-ai-types.ts`. `model` is
normalised to a known pricing key, else `other`. Tenant ids, lead ids, operation
ids and error text are never labels: they would leak data across tenants and
explode series cardinality.

---

## Drift definition

Every 30 minutes the scheduler compares, per model and per metric
(`score_distribution`, `confidence_level`):

- **current**: the last 6 hours of samples;
- **reference**: the same 6-hour slice of the day on each of the previous 7 days
  (so the normal daily rhythm is not reported as drift).

A tick is _detected_ when the two-sample Kolmogorov-Smirnov test gives p < 0.01
**and** either the excess PSI (PSI minus its small-sample bias, over 10 fixed
bins on [0,1]) or the KS statistic D is at least 0.1. Severity is the higher of
the PSI bands (0.1 / 0.2 / 0.25 / 0.5) and the D bands (0.1 / 0.2 / 0.3 / 0.5).
A detection is counted at onset, after 3 consecutive detected ticks, and again
each time the open event escalates to a higher severity than it had reached, so
an event that opens low and turns critical still reaches the high/critical
alert. The health summary reports only events open now. With fewer than 50
reference or 25 current samples the tick is `insufficient_data`, not "no drift".

Samples are kept for 8 days, capped at 50,000 per key, in memory: a restart
starts a new warm-up of up to 7 days.

---

## Dashboard panels (`ifc117-ai-models`)

1. How to read this dashboard (text: the limits below)
2. Inference p50 / p95 latency by chain
3. Inference calls by outcome
4. Errors by class
5. Model confidence (mean)
6. Hallucination rate, detected by heuristic checker (1h)
7. Hallucinations by type and skipped checks
8. LLM cost (USD, 24h)
9. Estimated value (USD, 24h)
10. Estimated ROI (24h), `n/a` when there is no cost to divide by
11. Drift score by model and metric
12. Drift checks and detections
13. Minutes since last drift check
14. Retraining triggers

The dashboard is committed in the ENV-008-AI dashboard-job shape. That job reads
only `dashboard-production.json` today, so this dashboard is **not applied**
until it reads more than one file (N3).

---

## Alert rules (folder and group `intelliflow-ai`)

| uid                            | Fires when                                                                   | For | Severity |
| ------------------------------ | ---------------------------------------------------------------------------- | --- | -------- |
| `ifc117-hallucination-rate`    | heuristic hallucination rate ≥ 5% over 1h, with ≥ 20 checks                  | 15m | high     |
| `ifc117-drift-shift`           | a high or critical drift onset in the last day                               | 0m  | medium   |
| `ifc117-drift-stalled`         | no drift check for 2h while ai-worker serves LLM calls                       | 30m | medium   |
| `ifc117-inference-p95-latency` | p95 chain latency above 2000 ms over 10m, with ≥ 10 calls                    | 10m | medium   |
| `ifc117-inference-error-ratio` | more than 5% of chain calls failed over 10m, with ≥ 10 calls                 | 10m | high     |
| `ifc117-ai-metrics-silent`     | LLM spans exist but no AI inference was recorded for 2h (metrics path broke) | 2h  | low      |

All rules are `requireSeries: false` with no-data OK until ai-worker is
promoted. The stalled and silent rules are also gated on the AI series existing,
so they cannot fire before then. They are applied only by the
`grafana-ai-alert-rules` workflow (on merge, or by hand with `dry_run`), never
in the Grafana UI. The IFC-032 group `intelliflow-prod` is never reused: its
script replaces the whole group.

---

## Limitations

- **Lead scoring only.** Auto-response is not monitored in production: its chain
  is instrumented but has no production caller.
- **Global scope.** Drift and the KPIs are computed across all tenants;
  per-tenant drift is a follow-up.
- **ROI is estimated.** Value is a fixed amount per scored lead, not booked
  revenue.
- **Hallucination is a floor.** The rate counts what the heuristic checker
  detects, not ground truth.
- **Timeouts can count twice** in the error ratio (chain monitor and caller
  retry).
- **Warm-up.** Drift needs up to 7 days of samples after each restart before the
  reference is full.
- **KPIs unproven.** "Drift detected within 1 day" and "hallucination rate < 5%"
  are production claims. Unit tests do not prove them; N1-N7 below do.

---

## Production evidence (Needs Human)

Owned by the task owner after ai-worker is promoted; the full table with queries
and thresholds is in `.specify/sprints/sprint-18/specifications/IFC-117-spec.md`
(Acceptance Criteria).

| #   | Evidence                                    |
| --- | ------------------------------------------- |
| N1  | Output-distribution shift detected in < 24h |
| N2  | Hallucination rate < 5% with ≥ 200 checks   |
| N3  | Dashboard applied                           |
| N4  | AI rules applied and routed                 |
| N5  | Metric names and service label verified     |
| N6  | Cost and estimated value both non-zero (7d) |
| N7  | Latency series exists                       |
