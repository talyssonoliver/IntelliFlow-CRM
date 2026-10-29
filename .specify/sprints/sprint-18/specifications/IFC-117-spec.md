# Specification: IFC-117 — Monitor AI models for drift, latency, hallucination and ROI

**Sprint:** 18 | **Status at spec:** In Progress (reopened 2026-10-05) | **Spec date:** 2026-10-25
**Session:** `/spec-session`, subagent mode, 5 agents (ai-specialist, devops-lead, security-lead,
domain-expert, test-engineer). Exploration, PROPOSAL and CHALLENGE rounds, then CONSENSUS **5/5
APPROVED** in round 1. Discussion: `IFC-117-discussion.md`. Consensus record:
`IFC-117-spec-consensus.json`.

## Overview

On main, the AI monitoring modules (`apps/ai-worker/src/monitoring/`) work in-process and feed the
in-app pages (PG-146/152/153) through the DB and Redis tiers (ADR-043, ADR-052). None of their data
reaches Grafana Cloud:

- The Prometheus exporter is mounted nowhere.
- The `intelliflow.ai.*` OTel instruments are never recorded.
- The repo dashboard and alert files query names that are never emitted.

Drift detection also never runs: `detectAllDrift` has no production caller, and its statistics
cannot see a pure shift. The task was reopened on 2026-10-05 for exactly this gap (sprint-6
`task-tracking.json` blockers). The sprint-6 PARTIAL attestations stay as history.

This task:

1. Records AI metrics through OTel from the real production path, so they ride ai-worker's existing
   OTLP export to Grafana Cloud.
2. Makes drift detection real: a schedule, correct statistics, and persistence.
3. Commits the AI alert rules as a repo file, applied by a CI workflow.
4. Commits the AI dashboard JSON. Its apply is NEEDS_HUMAN.
5. Deletes the dead, fail-open Prometheus exporter.

Production KPIs stay NEEDS_HUMAN until ai-worker is promoted and data exists (coordinator scope 4).

**Scope of the KPIs.** They cover lead scoring only. It is the only chain wrapped by `withMonitoring`
with real context in production (`apps/ai-worker/src/chains/scoring.chain.ts:244-259`; callers
`jobs/scoring.job.ts:220,239,557`). Auto-response gets the label only: `AutoResponseChain` has no
production instantiation (`chains/auto-response.chain.ts:245-249`, re-export only at
`index.ts:176`).

**DoD ambiguity, recorded.** The CSV DoD says "targets: >=5%", while the KPI says "hallucination rate
<5%". Per coordinator answer 3, the target is a rate below 5%, and the alert fires at **≥5%**. The DoD
text is not edited; rewording it is the owner's call (Category C boundary).

## Related Documents

| Type | Path | Status | Action |
| --- | --- | --- | --- |
| PRD | N/A | — | No user-facing feature. The in-app pages already exist (PG-146/152/153). |
| ADR | `docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md` | Accepted (2026-10-25) | Created. Covers OTel export of AI metrics, drift statistics, alert delivery and exporter removal. |
| ADR | `docs/architecture/adr/ADR-043-ai-monitoring-data-persistence.md` | Accepted | Referenced. The DB tier is unchanged. |
| ADR | `docs/architecture/adr/ADR-052-redis-monitoring-snapshot-bridge.md` | Accepted | Referenced. The Redis tier is unchanged. |
| Chain | `docs/architecture/diagrams/ai-intelligence-dependency-chain.md` | Stale | Corrected (`:23`, `:393-437`, `:546-550` mark IFC-117 complete). |

Not evidence, and never cited: `infra/monitoring/drift-detection-config.yaml` (Terraform infra drift)
and `infra/monitoring/optimization-loop.yaml` (DORA config).

## Dependency Verification

| Dependency | Claim | Verified | Method |
| --- | --- | --- | --- |
| IFC-005 | LangChain scoring with confidence | TRUE | `scoring.chain.ts` exists; confidence field at `apps/api/src/shared/scoring-output-schema.zod.ts:24` |
| AUTOMATION-002 | AI dashboard, optimisation loop, ROI | TRUE as files | `artifacts/metrics/metrics-realtime.json`, `optimization-loop.yaml` (14 lines, DORA), `artifacts/reports/roi-tracking.csv`. The "dashboard" is static JSON. That is the gap this task closes, so it does not block. |

## Technical Approach

### 1. OTel recording facade (ADR-088)

- **New module.** `apps/ai-worker/src/monitoring/otel-ai-metrics.ts` is the only code that creates
  instruments or attribute objects.
  - Meter: `metrics.getMeter('intelliflow-ai-worker-monitoring')` from `@opentelemetry/api`, on the
    global MeterProvider that ai-worker's NodeSDK registers. sdk-node 0.219 builds readers from env and
    defaults `OTEL_METRICS_EXPORTER` to otlp over http/protobuf. Production endpoint, protocol and
    headers come from Terraform (`infra/terraform/modules/monitoring/main.tf:26-29`, `main.tf:16-18`).
  - Pattern: `apps/api/src/tracing/query-budget-otel.ts:42-53`.
  - It never calls `initMetrics` (`packages/observability/src/metrics.ts:111`). That would register a
    second gRPC provider.
- **Instruments.** Created lazily and memoized; observable gauges are registered at worker boot.
  Every recorder and gauge callback is wrapped in try/catch and never throws into a chain.
  - Test seams: `__setMeterForTests` and `__resetAiMetricsForTests`. The reset also unregisters gauge
    callbacks.
- **Attribute allowlist.** Typed recorder inputs only; values are checked at runtime with
  `Object.hasOwn` on `as const` arrays.
  - `model`: run through `servedPricingKey` (`config/ai.config.ts:313-317`), then
    `Object.hasOwn(MODEL_PRICING, key)` (`:198`). Anything else becomes `other`, including `default`,
    `unknown`, `undefined`, `:free` names and prototype keys.
  - `chain`: `lead_scoring | auto_response | unknown`
  - `outcome`: `success | error`
  - `error_class`: `timeout | rate_limited | parse | other`, from a pure classifier. Never
    `error.name` or `error.message`.
  - `hallucination_type`: the union at `hallucination-checker.ts:20-28`
  - `value_type`: `roi-tracker.ts:22-35`
  - `urgency`: `none | low | medium | high | critical`
  - `metric`: `score_distribution | confidence_level`
  - `severity`
  - `status`: `evaluated | insufficient_data`
  - `reason`: the hallucination skip reasons
  - **Never** an attribute: operationId, tenantId, leadId, userId, error.message, inputContext,
    output, evidence, ROI metadata.
- **Pre-seeding.** At registration, counters get `add(0, attrs)` for the closed label sets that rules
  and ratios use: model × chain, and model × metric × severity for drift detections. A cardinality
  test bounds the pre-seeded and runtime series counts.

| Instrument | Type | Unit | Attributes |
| --- | --- | --- | --- |
| `intelliflow.ai.inference.latency` (reused name) | Histogram; advice buckets [50,100,250,500,1000,1500,2000,3000,5000,10000,30000] | ms | model, chain, outcome |
| `intelliflow.ai.inference.count` (reused) | Counter | 1 | model, chain, outcome, error_class (error only) |
| `intelliflow.ai.confidence` (reused) | Histogram | (none) | model, chain |
| `intelliflow.ai.cost.usd` | Counter | (none) | model, chain |
| `intelliflow.ai.value.estimated.usd` | Counter | (none) | chain, value_type |
| `intelliflow.ai.hallucination.checks` / `.detected` | Counter | 1 | model, chain |
| `intelliflow.ai.hallucination.types` | Counter (only when hallucinated) | 1 | model, chain, hallucination_type |
| `intelliflow.ai.hallucination.skipped` | Counter | 1 | chain, reason |
| `intelliflow.ai.drift.score` | ObservableGauge | (none) | model, metric |
| `intelliflow.ai.drift.detections` | Counter (once per event onset) | 1 | model, metric, severity |
| `intelliflow.ai.drift.checks` | Counter | 1 | status |
| `intelliflow.ai.drift.last_check` | ObservableGauge (observed only after the first tick) | (none), epoch s | — |
| `intelliflow.ai.retraining.triggers` | Counter | 1 | urgency |

Notes on the instruments:

- **Units.** Gauges carry no unit, which avoids the `_ratio` suffix. The package's GBP histogram
  `intelliflow.ai.inference.cost` (`metrics.ts:241-244`) is not reused, because pricing is in USD
  (`ai.config.ts:169`). An issue tracks its deprecation.
- **Expected Prometheus names are an ASSUMPTION.** The expectation is: dots become `_`, counters gain
  `_total`, `ms` becomes `_milliseconds`, and histograms expose `_bucket/_sum/_count`. Newer Grafana
  Cloud stacks may keep UTF-8 dotted names. Only the post-deploy dry run (N5) can verify this.

### 2. `withMonitoring` (`monitoring/chain-monitor.ts`)

- **Context.** `MonitoringContext` gains `chain?`, `valueType?` and `recordDrift?`.
  - The hard-coded `lead_scored` booking at `:241-245` is removed. Value is booked only when the
    caller passes `valueType`; when it is missing, a debug log line is written.
  - `scoring.chain.ts` passes `{chain:'lead_scoring', valueType:'lead_scored'}`.
  - The job-level fallback-provider chain (`scoring.job.ts:233-240`) passes `recordDrift:false`, so a
    provider switch is not read as drift.
  - `auto-response.chain.ts:248` passes `{chain:'auto_response'}`.
  - `modelVersion` is labelled from the chain's actual provider (`scoring.chain.ts:212`).
- **Success path.**
  - `recordInference(success)` runs immediately after latency is measured.
  - `recordConfidence` runs only for a raw, finite `confidence` in [0,1]. The default `1` at
    `:263-266` is never recorded.
  - Cost:
    - `computeTokenCost` returns `number | null`.
    - OTel cost is recorded only when usage is present AND the model key is known; 0 is a legitimate
      value.
    - Unknown keys get no OTel cost, because `calculateCost` would invent gpt-3.5 pricing
      (`ai.config.ts:324-331`).
    - The ROI tracker keeps its `>0` guard.
  - `recordEstimatedValue` is given the exact `AIValue.estimatedValue` returned by
    `roiTracker.recordValueByType` (`roi-tracker.ts:203`).
  - The drift sample is the score divided by 100, unconditionally. This fixes the `score > 1` bug at
    `:228`.
- **Hallucination.**
  - `computeHallucinationFlags` returns a `HallucinationOutcome`: `skipped{reason}`, `error`, or
    `checked{hallucinated, types}`.
  - `hallucinationFlags: string[]` is kept. `MonitoredResult.metrics` gains `hallucinated:
    boolean|null`.
  - The rate is counted **only** at this call site, from the `hallucinated` boolean
    (`hallucination-checker.ts:249-250`).
  - Direct `checkOutput` calls (`ai-worker.ts:1168,1253`, insight and prediction jobs) do not move
    these counters.
- **Error path.**
  - `recordInference(error, error_class)` is recorded, and the error is rethrown.
  - No drift sample, value or hallucination record is made.
- **Errors raised in `scoreLead` before `withMonitoring`** (tenant tier, LLM creation, prompt) are
  counted in the outer catch, with an "already counted" flag.
- **The `score:0` / `error:v1` fallback** (`scoring.chain.ts:285-307`) is not a quality or drift
  signal.

### 3. Drift (`monitoring/drift-detector.ts`, new `monitoring/drift-scheduler.ts`)

- **Metrics.** Only `score_distribution` and `confidence_level` are scheduled. Both are bounded 0..1
  (`packages/validators/src/lead.ts:118-119`). `user_satisfaction` and `user_correction_error` have no
  production producer, so the scheduler skips them.
- **Binning.**
  - 10 fixed equal-width bins on [0,1], with +0.5 additive smoothing. This replaces `epsilon` at
    `:453`.
  - The current window uses the same edges as the reference. This fixes per-window min/max at
    `:392-398`, which hid pure shifts.
- **Statistics.**
  - **Excess PSI** = PSI − (B−1)(1/n+1/m).
  - **Two-sample KS**: asymptotic, using the real n and m, with the ECDF evaluated at distinct values
    so ties are handled, and the full Kolmogorov series. This replaces the fixed n=100 at `:438`. It is
    documented as "asymptotic, conservative under ties".
- **Gate.**
  - A tick is detected when p < 0.01 AND (excess PSI ≥ 0.1 OR D ≥ 0.1).
  - Severity = max(excess-PSI band 0.1/0.2/0.25/0.5, D band 0.1/0.2/0.3/0.5).
  - The composite score is for display only. This retires the `(1-p)·0.5` floor at `:288`.
- **Persistence.**
  - An event starts after 3 consecutive detected evaluated ticks, and ends after 3 consecutive clear
    ticks.
  - `drift.detections` increments once per onset.
- **Reference baseline.**
  - The same 6h time-of-day slice on each of the previous 1..7 days, pooled. It never overlaps the
    current 6h window.
  - It needs at least 50 reference samples and at least 25 current samples; otherwise the status is
    `insufficient_data` (`:269`).
  - `setBaseline` stays as a manual pin.
  - Sample retention rises from 48h to 8d (`:124-125`), with a per-key cap of 50,000 newest samples.
    Pruning is amortised once per tick or from the front of the array, so `recordSample` stays O(1).
- **Structure.**
  - Keys become structured `{model, metric}`, replacing `split(':')` at `:330`.
  - `DriftResult` gains `model` and `status`.
  - The flush writes `model: dr.model`, fixing `monitoring-flush.service.ts:84`.
  - `driftHistory` is capped at 7d.
- **Scheduler.**
  - `DriftDetectionScheduler`, interval `slidingIntervalMinutes` (30 min), using
    `setInterval(...).unref()`.
  - Re-entrancy guard and per-tick try/catch. No run at boot.
  - Each tick records `checks{status}`, the onset detections and `last_check`. `last_check` also
    advances on `insufficient_data` ticks, so warm-up never reads as "stalled".
  - It starts **first** in `AIWorker.onStart()`, right after `loadAIConfig`, in its own try/catch
    (`ai-worker.ts:182-221`). It stops in `onStop()` before the flush.
  - This makes it the first production caller of `detectAllDrift`.
  - `AI_WORKER_MODE=library` is out of scope.
- **Logging.** Fixed fields only: counts, status, severity, model, metric, pValue, score, durationMs.
  Never results, distributions, recommendations or samples.
- **Honest limits** (also in ADR-088):
  - Samples live in memory, so every deploy restarts warm-up. Warm-up is at least 24h, about 2 days
    at the minimum rate.
  - Each replica keeps its own samples.
  - Detection needs at least about 4.2 scored leads per hour.
  - The pooled reference mixes weekday and weekend slices.
  - It is an "output distribution shift (lead mix or model)" signal, not proof of model change.
    Confidence drift is the closer proxy for model change.
  - Drift is global: the in-app API shows it to every tenant (`AIMonitoringService.ts:59-60`), as a
    model-level aggregate only.

### 4. Delete the dead exporter

- Delete `apps/ai-worker/src/metrics/prometheus-exporter.ts` and its test. Reasons:
  - It falls back to the token `'default-dev-token'` (`:69-71`).
  - Its compare is not constant-time (`:78-79`).
  - Its status handler has no auth (`:141-155`).
  - It is mounted nowhere.
- `jobs/feedback-analytics.job.ts:22,172` uses `recordRetrainingTrigger`, with urgency clamped.
- Also delete `getAllMetrics` (`monitoring/index.ts:108`) and the four Prometheus text builders (drift,
  ROI, latency, hallucination):
  - Only after a grep by import path confirms there is no non-test consumer. `packages/platform` has
    an unrelated `getAllMetrics`.
  - In the same commit as their tests: `monitoring/__tests__/index.test.ts:95,145-154`,
    `drift-detector.additional.test.ts:841-883`, `latency-monitor.additional.test.ts:752-799` and
    `roi-tracker.test.ts:1106-1155`.
- `getMonitoringStatus` stays.

### 5. AI alert rules (sibling script and workflow; coordinator answer 4)

- **New files:**
  - `infra/monitoring/grafana/cloud/ai-alert-rules.json`
  - `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs` and its `.d.mts`
  - `.github/workflows/grafana-ai-alert-rules.yml`
- **Untouched:** `apply-grafana-alert-rules.mjs` and `grafana-alert-rules.yml`, because ENV-008-AI is
  editing them.
- **Folder and group:** `intelliflow-ai` for both. Rule uids carry the prefix `ifc117-`. The script
  rejects the IFC-032 folder and group values.
- **Script.**
  - Copies `validateConfig` and `SAFE_PATH_SEGMENT`. A test asserts `.source` parity with the original.
  - Also validates `datasourceUid`, which is interpolated at `grafana-provisioning.mjs:37`.
  - Reuses the lib's `createApiClient`, `querySeriesCount` and `buildAlertRulePayload(entry, config,
    'ifc-117')`, read-only. The signature is confirmed with env-008-ai-c7 before coding.
  - No `deliveryTest` and no `send_test`.
  - `--dry-run` also instant-queries every rule `expr` and fails on an HTTP error or a status other
    than `success`. A PromQL typo would otherwise page through `execErrState: 'Error'`
    (`grafana-provisioning.mjs:58`).
  - Grafana response text is truncated and redacted. The token is never printed.
- **Workflow.**
  - Triggers: push on main (paths: the rules file, the script, the workflow file,
    `grafana-provisioning.mjs`) plus `workflow_dispatch{dry_run}`. Never `pull_request` or
    `pull_request_target`.
  - `environment: Production`, `permissions: contents: read`, its own concurrency group, and the
    token only in `env:`.
  - Pinned to checkout@v7, setup-node@v7 and node 24.
- **Rules.** All are `requireSeries:false` and `noData:"OK"` until promotion.

| uid | Condition | Severity |
| --- | --- | --- |
| `ifc117-hallucination-rate` | detected ÷ checks ≥ 0.05 over 1h, with ≥ 20 checks (`>= bool 0.05`, operator gt 0) | high |
| `ifc117-drift-shift` | `increase(intelliflow_ai_drift_detections_total{severity=~"high|critical"}[1d]) > 0` | medium |
| `ifc117-drift-stalled` | `time() - max(last_check)` > 2h, for 30m, while LLM spans flow | medium |
| `ifc117-inference-p95-latency` | p95 > 2000 ms for 10m, with ≥ 10 calls (threshold re-checked after the first measured week) | medium |
| `ifc117-inference-error-ratio` | error ÷ total > 5%, with ≥ 10 calls | high |
| `ifc117-ai-metrics-silent` | no AI inferences for 2h while LLM spans flow | low |

- **PromQL details.**
  - Resource selector: `job=~"(.*/)?(intelliflow-)?ai-worker"`.
  - Span gate: `service=~"(intelliflow-)?ai-worker", span_name=~"llm.*"`. LLM spans are used so that
    health-probe spans cannot make the gate pass (`tracing/llm-tracer.ts:77,194,233`).
  - Absence rules use `(… or vector(0))`. Ratio numerators use `or vector(0)` and denominators use
    `clamp_min`.

### 6. Dashboard (coordinator answer 5)

- `infra/monitoring/grafana/cloud/dashboard-ai-models.json`:
  - uid `ifc117-ai-models`, folder `intelliflow-prod`, datasource `grafanacloud-prom`, no panel ids.
  - File shape: whatever env-008-ai-c7 confirms. Default: a bare dashboard model.
- **Panels:**
  - Hallucination rate and check volume, labelled "detected by heuristic checker".
  - Output distribution shift: score, onset detections, checks by status, heartbeat.
  - Inference rate by outcome.
  - Latency p50/p95/p99.
  - Cost and estimated value in USD. ROI% is computed in PromQL, labelled "estimated", and shows n/a
    when cost is 0. It notes the timeout double-count, and that auto-response is not monitored in
    production.
- **Apply is NEEDS_HUMAN.** ENV-008-AI's planned job applies one fixed file and allows only span
  metrics (`env-008-ai/.specify/sprints/sprint-18/planning/ENV-008-AI-plan.md:293-300`). An issue asks
  for multi-file support and an `intelliflow_ai_*` allowlist. No second apply path is built.

### 7. Docs, CSV and artifacts

- **Dependency chain.** Correct `ai-intelligence-dependency-chain.md`.
- **`docs/planning/drift-dashboard.md`.** Rewrite it to describe the real panels, metrics, rules and
  definitions, with no invented figures. Name the new files as canonical and the old ones as
  superseded.
- **`artifacts/metrics/ai-metrics.json`.**
  - Keep the `kpis.*` keys (read by `apps/project-tracker/app/api/tracking/ai/route.ts:6,59-70`).
  - Null the measured fields (`current_*`, `status`, `current_hours`) as NEEDS_HUMAN, but only after
    the route and `AIMetrics.tsx` are shown to tolerate null with no NaN or "undefined%". If they do
    not, make a minimal tolerant change there with a test.
  - Leave the dangling `$schema` as it is. The sprint-6 hash mismatch is expected.
- **Old files stay UNTOUCHED.** `infra/monitoring/ai-grafana-dashboard.json`, `ai-prometheus-rules.yaml`
  and `alerts-config.yaml` are referenced by the TRACK-004 `FILE:` (`Sprint_plan.csv:340`), its
  sprint-14 attestation hash, and the IFC-055 and IFC-142 attestations. An issue retires them with
  those owners.
- **CSV row IFC-117, Category B rebaseline** (`docs/operations/agent-autonomy-policy.md:130-148`):
  - The `ARTIFACT:` entries for `prometheus-exporter.ts`, `ai-grafana-dashboard.json` and
    `ai-prometheus-rules.yaml` change to `otel-ai-metrics.ts`, `grafana/cloud/ai-alert-rules.json` and
    `grafana/cloud/dashboard-ai-models.json`. The dashboard is marked as not delivered until N3.
  - Old → new is logged in `docs/planning/plan-change-log.md`.
  - Only the canonical CSV is edited. The splits are regenerated and plan validation runs.
  - `EVIDENCE:` gains the sprint-18 attestation path (Category A).
  - The DoD text is not edited.
- **End status: `Needs Human`.** It is legal from `In Progress` (`tools/scripts/lib/workflow/config.ts:64`).
  The plan first verifies that the CSV validator, `split-sprint-plan` and `.claude/hooks/csv-status-guard.mjs`
  accept it. If any of them does not, the status stays `In Progress` with the reason recorded.

## Components

| Path | Action |
| --- | --- |
| `apps/ai-worker/src/monitoring/otel-ai-metrics.ts` | NEW |
| `apps/ai-worker/src/monitoring/drift-scheduler.ts` | NEW |
| `apps/ai-worker/src/monitoring/chain-monitor.ts` | MODIFY |
| `apps/ai-worker/src/monitoring/drift-detector.ts` | MODIFY |
| `apps/ai-worker/src/monitoring/monitoring-flush.service.ts` | MODIFY (`:84`) |
| `apps/ai-worker/src/monitoring/index.ts` | MODIFY (exports; remove `getAllMetrics`) |
| `apps/ai-worker/src/monitoring/{roi-tracker,latency-monitor,hallucination-checker}.ts` | MODIFY (remove text builders) |
| `apps/ai-worker/src/chains/scoring.chain.ts`, `auto-response.chain.ts` | MODIFY (context) |
| `apps/ai-worker/src/jobs/scoring.job.ts` | MODIFY (fallback `recordDrift:false`) |
| `apps/ai-worker/src/jobs/feedback-analytics.job.ts` | MODIFY |
| `apps/ai-worker/src/ai-worker.ts` | MODIFY (scheduler start/stop, gauge registration) |
| `apps/ai-worker/src/metrics/prometheus-exporter.ts` + test | DELETE |
| `apps/ai-worker/package.json` | MODIFY (devDependency `@opentelemetry/sdk-metrics` `2.8.0`, the exact version sdk-node 0.219 depends on) |
| `infra/monitoring/grafana/cloud/ai-alert-rules.json`, `dashboard-ai-models.json` | NEW |
| `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs` + `.d.mts` | NEW |
| `.github/workflows/grafana-ai-alert-rules.yml` | NEW |
| `docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md`, ADR README row | NEW / MODIFY |
| `docs/architecture/diagrams/ai-intelligence-dependency-chain.md`, `docs/planning/drift-dashboard.md`, `docs/planning/plan-change-log.md` | MODIFY |
| `artifacts/metrics/ai-metrics.json` | MODIFY (measured fields only) |
| `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (+ regenerated splits) | MODIFY (IFC-117 row) |

## Interfaces & Contracts

```ts
// otel-ai-metrics.ts
export type ChainId = 'lead_scoring' | 'auto_response' | 'unknown';
export function registerAiMetrics(): void; // gauges + pre-seeding; called at worker boot
export function recordInference(i: { model?: string; chain: ChainId; outcome: 'success' | 'error'; latencyMs: number; error?: unknown }): void;
export function recordConfidence(i: { model?: string; chain: ChainId; confidence: unknown }): void;
export function recordCost(i: { model?: string; chain: ChainId; usd: number }): void;
export function recordEstimatedValue(i: { chain: ChainId; valueType: string; usd: number }): void;
export function recordHallucination(i: { model?: string; chain: ChainId; outcome: HallucinationOutcome }): void;
export function recordDriftTick(results: readonly DriftResult[]): void; // checks, onsets, snapshot for gauges
export function recordRetrainingTrigger(i: { urgency: string }): void;
export const AI_METRIC_DEFINITIONS: readonly { name: string; type: 'counter' | 'histogram' | 'gauge'; unit: string }[];
```

- Callers never build attribute maps.
- Recorders return `void` and never throw.

## Integration Points

- **NodeSDK global meter provider.** `apps/ai-worker/src/tracing/otel.ts:82-85`, started from
  `index.ts:15`. No SDK or env change.
- **In-app DB and Redis tiers.** Unchanged, apart from two fixes:
  - the drift `model` field (`monitoring-flush.service.ts:84`)
  - value no longer booked for context-less calls, which are not real production callers
- **Grafana Cloud.**
  - Rules arrive through the sibling workflow, using the `GRAFANA_SA_TOKEN` Production environment
    secret.
  - The dashboard arrives through ENV-008-AI's job once it is generalised. That step is NEEDS_HUMAN.

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
| --- | --- | --- | --- |
| `recordInference/Confidence/Cost/EstimatedValue/Hallucination` | `withMonitoring` (`chain-monitor.ts:197`), reached from `LeadScoringChain.scoreLead` (`scoring.chain.ts:244`), reached from `jobs/scoring.job.ts:220,239,557` | the never-mounted Prometheus text path | lead scoring is the only real production consumer |
| outer-catch error count | `LeadScoringChain.scoreLead` catch (`scoring.chain.ts:285-307`) | — | guarded by an "already counted" flag |
| `DriftDetectionScheduler` + `recordDriftTick` | `AIWorker.onStart()` (`ai-worker.ts:182`) | nothing: `detectAllDrift` had no production caller | first production caller |
| `registerAiMetrics` (gauges, pre-seed) | `AIWorker.onStart()` | — | at boot, not on first record |
| `recordRetrainingTrigger` | `jobs/feedback-analytics.job.ts:172` (BullMQ cron, `ai-worker.ts:777-789`) | `incrementRetrainingTriggers` in `prometheus-exporter.ts` | the exporter is deleted |
| AI alert rules | `.github/workflows/grafana-ai-alert-rules.yml` (push to main + dispatch) | `infra/monitoring/ai-prometheus-rules.yaml` (never loaded) | the old file stays untouched and is marked superseded in docs |
| AI dashboard | ENV-008-AI dashboard job (after its follow-up) | `infra/monitoring/ai-grafana-dashboard.json` (never loaded) | NEEDS_HUMAN (N3) |

## Navigation & Reachability

N/A. There is no UI change. The in-app pages PG-146/152/153 exist, and their routes are unchanged.

## Acceptance Criteria

Provable in this PR:

- **AC-001.** A real `LeadScoringChain.scoreLead` call through `withMonitoring` (real `ChatOpenAI`,
  fake fetch) records data points on the latency, count, cost, estimated-value, confidence and
  hallucination-checks instruments. Each point has the exact allowlisted attributes and is read from
  an in-memory reader. `simulateScoringChain` does not count.
- **AC-002.** On the error path, `outcome=error` is recorded with a classified `error_class`. No value
  is booked. The hallucination checks counter does not move, and **no drift sample** is recorded.
- **AC-003.** Hallucination checks/detected count only at the call site, from the `hallucinated`
  boolean. `.types` is recorded only when hallucinated. Skip paths record `skipped{reason}` and leave
  `checks` unchanged.
- **AC-004.** Direct `hallucinationChecker.checkOutput` calls (the `ai-worker.ts:1253` path) do not
  move the call-site counters.
- **AC-005.** Drift statistics:
  - a pure shift (same spread, shifted mean) is detected
  - a no-shift control is not
  - KS uses the real n and m and handles ties
  - excess PSI under the null at n=25/m=50 stays below the gate
  - the false-positive rate over 200 seeded null windows is bounded
  - gate and band boundaries are tested
  - persistence counts one onset per event
  - the reference windows are time-of-day matched and never overlap the current window
- **AC-006.** `DriftDetectionScheduler`:
  - runs `detectAllDrift` every 30 min from worker start
  - records checks, onsets and `last_check`, including on `insufficient_data` ticks
  - is idempotent on start
  - `stop()` leaves no timers
  - starts even if a later `onStart` step throws
- **AC-007.** With fewer samples than required, the status is `insufficient_data`, never "none".
- **AC-008.** Cost and estimated value are separate USD instruments. Cost is recorded only when usage
  is present and the model key is known. Value is booked only for an explicit `valueType`. The
  scoring score is normalised by dividing by 100.
- **AC-009.** Attribute policy:
  - every data point's attribute keys are a subset of the allowlist
  - unknown values map to `other`
  - no canary from tenant, lead, operationId, error message, inputContext or output appears in any
    attribute or log line
  - series counts stay within the computed bound
- **AC-010.** No non-test ai-worker file imports `initMetrics`. Instruments come from `@opentelemetry/api`.
- **AC-011.** The exporter is deleted:
  - `prometheus-exporter.ts` and its test are gone, with no remaining import
  - `recordRetrainingTrigger` replaces it, with urgency clamped
  - `getAllMetrics` and the text builders are removed together with their tests
- **AC-012.** `ai-alert-rules.json`:
  - passes the sibling script's validation
  - uids are pinned with the `ifc117-` prefix, in folder and group `intelliflow-ai`
  - every rule is `requireSeries:false`
  - the hallucination threshold is ≥ 0.05
  - every expr and selector references a registered instrument's translated name or the LLM span gate
  - the dry run also executes every expr
  - the token is never printed
  - the workflow YAML contract holds (no PR triggers, `contents: read`, Production environment, token
    only in env)
- **AC-013.** Every metric in `dashboard-ai-models.json` and in the rules is a registered instrument
  per the golden-name table. The old dead files, as fixtures, FAIL the same check.
- **AC-014.** The docs in §7 are corrected. `ai-metrics.json` holds no measured value without
  evidence. The TRACK-004 route and UI tolerate the nulls.
- **AC-015.** The sprint-18 attestation:
  - records the provable ACs
  - lists N1..N7 as NEEDS_HUMAN, each with who, command or query, and pass threshold
  - cites no unit test as KPI proof
  - leaves the sprint-6 attestations untouched

NEEDS_HUMAN after the owner promotes ai-worker (the verdict stays NEEDS_HUMAN until these close):

| ID | Claim | Who | Query / command | Pass |
| --- | --- | --- | --- | --- |
| N1 | Output-distribution shift detected within 1 day | owner | Natural shift observed, or a seeded replay; `increase(intelliflow_ai_drift_detections_total[1d])` and `intelliflow_ai_drift_checks_total{status="evaluated"}` | onset < 24h after the shift. If no shift: checks every 30 min for 7d, evaluated after warm-up. Otherwise recorded as "not exercised". |
| N2 | Hallucination rate < 5% (detected by checker; a floor) | owner | `sum(increase(…_hallucination_detected_total[7d])) / sum(increase(…_hallucination_checks_total[7d]))` | < 0.05 with ≥ 200 checks. Otherwise "insufficient data". |
| N3 | Dashboard applied | ENV-008-AI follow-up, then owner | ENV-008 dashboard job | dashboard uid live with panels showing data |
| N4 | AI rules applied and routed | owner | dispatch `grafana-ai-alert-rules.yml` (dry_run=false); Grafana "Preview routing" for `{source:ifc-117, grafana_folder:intelliflow-ai}` | rules visible, route resolves to the owner's contact point |
| N5 | Names and service label verified | owner | dispatch `dry_run=true` after a scoring call | non-zero `series N` for each selector; the expr queries succeed |
| N6 | ROI (estimated) tracked | owner | `increase(…_cost_usd_total[7d])`, `increase(…_value_estimated_usd_total[7d])` | both non-zero over 7d |
| N7 | Latency series | owner | `histogram_quantile(0.95, sum by (le)(rate(…_inference_latency_milliseconds_bucket[1h])))` | a series exists |

Promotion follow-up (owner to set the date when ai-worker is promoted): flip `requireSeries:true` on
at least the heartbeat and inference-count rules, using the N5 output as evidence.

## Non-Functional Requirements

- **NF-001.** Bounded cardinality, tested. All attribute values come from closed sets.
- **NF-002.** No PII, tenant, lead or free text in any metric attribute or new log line.
- **NF-003.** Recording never throws into a chain and never changes its result (tested with a throwing
  instrument).
- **NF-004.** No extra LLM call. Per-call overhead is negligible: synchronous counter and histogram
  updates only.
- **NF-005.** Tests leave no leaked timers or providers. Clean exit is verified with `COVERAGE_RUN=1`.
- **NF-006.** Drift and rate math stays free of OTel imports. Instruments live in the facade.
- **NF-007.** Thresholds (5%, drift bands, 2000 ms) live in one exported config. The rules file test
  checks against it.
- **NF-008.** No secret-shaped strings in code, tests or docs (`.gitleaks/shared.toml`). The staged
  secret scan runs before every commit.
- **NF-009.** Tests are Windows-safe: no POSIX-only shell.
- **NF-010.** Full pre-ship with no bypass. The lockfile change widens local tests to the full suite.

## Test Requirements

New test files:

- `apps/ai-worker/src/chains/__tests__/scoring.chain.otel.integration.test.ts`
  - **Setup in `beforeEach`.** `__resetFactoryCache()`, a global fetch stub, `vi.stubEnv('AI_PROVIDER','mock')`
    followed by `vi.resetModules()` and a dynamic import, a mocked cost tracker, and a fresh
    `createChainMonitor()` per test.
  - **Request assertion.** `response_format.type === 'json_schema'`. The fake response is a
    `chat.completion` with the schema JSON as content and standard `usage` fields.
  - **Cost.** The expected cost is a literal derived from `MODEL_PRICING['scoring-free']`.
  - **Hallucination.** Factor reasoning is at least 10 characters, so the checker runs.
  - **Guards.** `score > 0`, `modelVersion !== 'error:v1'`, fetch called exactly once.
  - **Reader.** A DELTA `MetricReader` subclass. `setGlobalMeterProvider` must return `true`.
  - **Wiring.** Assert that the aliased `@opentelemetry/api` reaches the provider.
  - **Concurrency.** A `Promise.all` case for concurrent calls.
  - **Error path and leak canaries.** Covered, as listed under AC-002 and AC-009.
- `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.test.ts`: names, units, buckets, the
  allowlist, prototype keys, the cardinality and pre-seed bounds, the error canary, exhaustiveness,
  and that recorders never throw.
- `apps/ai-worker/src/monitoring/__tests__/chain-monitor.otel.test.ts`: the call-site semantics in §2.
- `apps/ai-worker/src/monitoring/__tests__/drift-detector.shift.test.ts`: AC-005, using the seeded
  generator mulberry32 and `vi.useFakeTimers({toFake:['Date']})`.
- `apps/ai-worker/src/monitoring/__tests__/drift-scheduler.test.ts`: AC-006, with a captured-logger
  leak test.
- `tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts`: validation, negatives, the uid prefix,
  rejection of the IFC-032 folder/group, `SAFE_PATH_SEGMENT` parity, fake Grafana with dry-run expr
  execution, the token never logged, and the workflow YAML contract.
- `tools/scripts/__tests__/ai-monitoring-assets.test.ts`:
  - golden-name table (ASSUMPTION), with names derived by running every recorder
  - PromQL tokenizer, with a non-empty result per expr
  - label allowlist check
  - negative fixtures under `__tests__/fixtures` that must fail

Existing suites to rewrite or rerun:

- `monitoring/__tests__/chain-monitor.test.ts:350-366` (value without context): rewrite.
- `chain-monitor.metrics-fidelity.test.ts`, `monitoring/__tests__/index.test.ts`: rerun.
- `drift-detector.test.ts:262-290`: fix. It uses `Math.random` and only asserts `toBeDefined`.
- `drift-detector.additional.test.ts`, `latency-monitor.additional.test.ts`, `roi-tracker.test.ts`:
  remove the text-builder cases.
- `jobs/__tests__/feedback-analytics.job.test.ts:28-31`: rewrite the mock.
- `chains/__tests__/scoring-with-monitoring.integration.test.ts`: delete (fake-green).
- `chains/scoring.chain.test.ts`, `lib/__tests__/usage-metering.test.ts`, `lib/__tests__/llm-factory*.test.ts`,
  `jobs/__tests__/scoring.job*`: rerun.
- `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`: rerun unchanged.
- `apps/project-tracker/__tests__/tracking/ai-api.test.ts`: rerun after the `ai-metrics.json` change.

Coverage:

- New modules ≥ 95%. `chain-monitor.ts` and the changed `drift-detector.ts` code ≥ 90% branch.
- The new tools script is within diff-coverage (`vitest.config.ts:228-229,308`).
- Confirm that none of these files appear in the coverage exclusions at `vitest.config.ts:377-404`.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Live Prometheus names or the service label differ from the assumption, so rules sit silently in noData | Tolerant regex selectors. Absence rules use `or vector(0)`. N5 dry run is a gating NEEDS_HUMAN. `requireSeries:true` is restored in the promotion follow-up. |
| Drift false alarms from daily or weekly lead-mix cycles | Time-of-day matched reference, α = 0.01, persistence over 3 ticks, excess PSI. Wording is "output distribution shift". The weekday/weekend mix is documented. |
| Deploys reset the in-memory samples, so "within 1 day" never holds on a daily deploy cadence | Documented limit (warm-up ≥ 24h, about 2 days at the minimum rate); `insufficient_data` is visible. Issue: hydrate samples from the DB at boot. |
| Global OTel state contaminates tests (`apps/ai-worker/vitest.config.ts:32-36`) | Facade test seam; one small global-wiring test whose `setGlobalMeterProvider` result is asserted. If it cannot run in the normal suite, the plan decides before RED. |
| A fake-green real-chain test, because errors are swallowed into `score:0` | Three guards plus the `response_format` assertion. |
| The ENV-008-AI lane changes `grafana-provisioning.mjs` | Read-only reuse. The signature is confirmed with env-008-ai-c7 and a rebase happens before merge. A parity test covers the copied validation. |
| Two copies of the Grafana validation | Parity test, and an issue to extract it into the lib after ENV-008 merges. |
| Hallucination KPI is a heuristic floor | Labelled "detected by checker" everywhere. Calibration is part of N2. |
| A timeout race counts one job twice | Rare; documented on the dashboard. |
| The CSV `Needs Human` status is rejected by a guard | Checked first in the plan, with a fallback to `In Progress` and the reason recorded. |

**Out of scope.** Each item below is filed as an issue (R-7 in the discussion):

- outcome-based ROI (owner decision)
- per-tenant drift via the DB tier
- the unwrapped chains and agents
- the unauthenticated health-server `/metrics` and its `error.message` leak
- deprecating the GBP cost histogram
- unbounded `hallucinationChecker.results`
- hydrating drift samples from the DB
- multi-file dashboards in ENV-008
- extracting the shared Grafana validation
- retiring the old dashboard, rules and alerts files with the TRACK-004, IFC-055 and IFC-142 owners
- rewording the CSV DoD (owner)
- `context-hydration.ts:308` returning 0 patterns on Windows

## Agent Sign-offs

All five agents read code with tools and cited file:line in every round. The consensus round is
recorded in `IFC-117-spec-consensus.json`.

| Agent | Vote | Non-blocking modifications (folded into this spec) |
| --- | --- | --- |
| ai-specialist | APPROVED | warm-up about 2 days at the minimum rate; amortised pruning; per-key sample cap; `last_check` advances on insufficient_data |
| devops-lead | APPROVED | pre-seed drift detections for the rule's label set; stalled rule aggregates with `max()`; CSV status pre-check with fallback; pre-seed count in the cardinality test |
| security-lead | APPROVED | per-key cap with retention; global drift as a model-level aggregate only (ADR); null-tolerance as an explicit step; owner and date for the promotion follow-up |
| domain-expert | APPROVED | weekday/weekend note (ADR); null check covers `current_hours` and `status` and NaN in the UI; no drift sample on the error path (AC-002); dashboard not "delivered" in the CSV until N3 |
| test-engineer | APPROVED | assert the api alias reaches the provider; budget the full-suite pre-ship; per-key cap test; `Promise.all` concurrency test; decide where the global-wiring test lives up front |
