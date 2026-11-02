# ADR-088: AI model monitoring through OpenTelemetry export

**Status:** Accepted (2026-10-25, after the IFC-117 validation matrix passed).
Production verification of the decision (spec evidence N1-N7) is NEEDS_HUMAN
until ai-worker is promoted.

**Date:** 2026-10-25

**Deciders:** IFC-117 spec session (ai-specialist, devops-lead, security-lead,
domain-expert, test-engineer; consensus 5/5); coordinator (Aurora); owner
rulings pending where marked NEEDS_HUMAN

**Technical Story:** IFC-117

**Extends:** ADR-043 (DB persistence of AI monitoring data) and ADR-052 (Redis
snapshot bridge). Both stay unchanged as the in-app tier.

## Context and Problem Statement

The ai-worker's monitoring modules (drift, hallucination, latency, ROI in
`apps/ai-worker/src/monitoring/`) only ever reach the in-app pages, through the
DB and Redis. None of their data reaches Grafana Cloud:

- **The Prometheus exporter is unused.**
  `apps/ai-worker/src/metrics/prometheus-exporter.ts` is mounted nowhere. It
  also fails open: it falls back to a default token, compares tokens in
  non-constant time, and its status handler has no auth.
- **The OTel instruments are never recorded.** The `intelliflow.ai.*`
  instruments in `packages/observability/src/metrics.ts` exist, but nothing in
  ai-worker records to them.
- **The repo dashboard and rules query dead names.**
  `infra/monitoring/ai-grafana-dashboard.json` and `ai-prometheus-rules.yaml`
  only use names the unused exporter would have produced.
- **Drift is never detected.** `detectAllDrift` has no production caller. Its
  statistics also hide a pure shift: each window uses its own bin edges, the KS
  test uses a fixed n=100, and the `(1-p)·0.5` floor rates every significant
  shift as "high".

How should AI-model metrics reach Grafana Cloud, and how should drift be
detected credibly?

## Decision Drivers

- Metrics must come from the real production path, not from a parallel or
  simulated one.
- No second meter provider, and no inbound metrics endpoint (security).
- Bounded label cardinality, with no PII or tenant identifiers in metric labels.
- Alerts and dashboards live as code and are applied by CI, never by hand (owner
  ruling via the coordinator).
- Do not collide with ENV-008-AI, which is rewriting the existing Grafana apply
  script and workflow.
- Lead traffic has daily cycles, and ai-worker deploys often.

## Considered Options

1. Mount the existing Prometheus exporter and have Grafana Cloud scrape
   ai-worker.
2. Call `initMetrics()` from `packages/observability` in ai-worker (its own
   MeterProvider with a gRPC exporter).
3. Record through `@opentelemetry/api` `metrics.getMeter(...)` on the global
   MeterProvider that ai-worker's NodeSDK already registers. NodeSDK exports
   OTLP over http/protobuf to the Grafana Cloud gateway, configured by Terraform
   environment variables.

## Decision Outcome

Chosen option: **3**. It is the only option that adds no inbound endpoint and no
second provider, and it reuses an export path that already works in production.
The precedent is `apps/api/src/tracing/query-budget-otel.ts`.

- **Option 1 is rejected.** It needs an authenticated inbound surface on Railway
  and a scrape config that does not exist, and the exporter's auth fails open.
- **Option 2 is rejected.** A second global provider fails to register, or runs
  with duplicate instruments. It also uses gRPC against an HTTP-only gateway.

Decisions that follow:

- **Recording facade.** `apps/ai-worker/src/monitoring/otel-ai-metrics.ts` is
  the only code that creates instruments or attributes. Attributes come from a
  closed allowlist. Model keys are `MODEL_PRICING` keys, and anything unknown
  becomes `other`. The facade never records operationId, tenantId, leadId, error
  messages or model text. Recorders never throw.
- **Counting point.** `withMonitoring` is the counting point. Hallucination rate
  is `detected ÷ checks`, taken from the checker's `hallucinated` boolean at
  that call site. Cost and _estimated_ value are separate USD counters. ROI% is
  computed in PromQL and labelled "estimated". Outcome-based ROI is a follow-up
  for the owner.
- **Drift detection is scheduled and corrected.**
  - It runs every 30 minutes from `AIWorker.onStart()`.
  - It uses fixed shared bins with smoothing and excess PSI (bias-corrected),
    plus an asymptotic two-sample KS test with the real n and m and tie-aware
    ECDFs.
  - A tick counts as drifted only when p < 0.01 and the effect size passes a
    gate.
  - An event is declared only after three consecutive drifted ticks.
  - The reference baseline is the same 6h time-of-day slice on each of the
    previous 1 to 7 days, held in memory for up to 8 days with a per-key cap.
- **Alert rules.** They are a repo file in their own folder and group
  (`intelliflow-ai`), with uid prefix `ifc117-`. A sibling script and workflow
  apply them, reusing `tools/scripts/lib/grafana-provisioning.mjs`. The rules
  stay `requireSeries:false` until ai-worker is promoted.
- **Dashboard.** It is a repo file. Its apply rides ENV-008-AI's dashboard job
  once that job supports more than one file. No second apply path is built.
- **Exporter.** `prometheus-exporter.ts` is deleted, together with its
  Prometheus text builders.

### Positive Consequences

- AI metrics reach Grafana Cloud through an existing, authenticated,
  outbound-only path.
- Drift detection actually runs, can see pure shifts, and is resistant to
  multiple-testing noise.
- The alert surface is code-reviewed and CI-applied, and isolated from the
  IFC-032 rule group.
- One fail-open endpoint is removed.

### Negative Consequences and Known Limits

- **Unverified names.** The OTel-to-Prometheus name translation and the live
  service label cannot be verified from the repo. A post-deploy dry-run series
  check (NEEDS_HUMAN) is the gate.
- **Warm-up after every deploy.** Drift samples are in memory, so every deploy
  restarts warm-up. It takes at least 24h, and about 2 days at the minimum rate
  of roughly 4.2 scored leads per hour. Each replica also keeps its own samples.
  A follow-up issue covers hydrating samples from the DB.
- **Weekday and weekend mixing.** The pooled 1 to 7 day reference mixes weekday
  and weekend slices, so weekend ticks may be flagged more often until a
  weekday-matched reference is added.
- **Drift measures output, not the model.** It is an output-distribution shift
  (lead mix or model), not proof of a model change. The confidence distribution
  is the closer proxy for model change.
- **Drift is global.** The in-app API shows it to every tenant. It is a
  model-level aggregate only, with no tenant-derived label or value. Per-tenant
  drift is a follow-up through the DB tier.
- **Hallucination rate is a floor.** It is a heuristic-checker rate ("detected
  by checker"), not ground truth.
- **Value is a constant.** Estimated value is a configured constant per scored
  lead, so ROI% is indicative only.
- **Coverage is lead scoring only.** Auto-response has no production call site.
  The other chains and agents are not wrapped (follow-up).
- **Duplicated validation.** The Grafana validation is duplicated in the sibling
  script until it can be extracted into the lib after ENV-008-AI merges. A
  parity test guards the copy.
- **Old files kept.** The old `ai-grafana-dashboard.json`,
  `ai-prometheus-rules.yaml` and `alerts-config.yaml` stay on disk, untouched,
  because other tasks' attestations hash them. They are superseded by the
  `infra/monitoring/grafana/cloud/` files, and an issue retires them with their
  owners.

## Links

- Spec: `.specify/sprints/sprint-18/specifications/IFC-117-spec.md`
- Discussion: `.specify/sprints/sprint-18/specifications/IFC-117-discussion.md`
- ADR-043, ADR-052
