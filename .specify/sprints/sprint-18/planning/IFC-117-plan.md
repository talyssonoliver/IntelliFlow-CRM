# Execution Plan: IFC-117 — Monitor AI models for drift, latency, hallucination and ROI

**Spec:** `.specify/sprints/sprint-18/specifications/IFC-117-spec.md`, consensus 5/5 APPROVED
(`IFC-117-spec-consensus.json`).
**ADR:** `docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md` (Proposed).
**Worktree:** `C:/Users/talys/projects/intelliFlow-CRM-worktrees/ifc-117`.
**Branch:** `feat/IFC-117-ai-model-monitoring`, from origin/main `d8bf93c40`. Spec committed as `ae475acc2`.
**PRD:** N/A. The spec gives the reason: no user-facing feature.

**Commands.** All commands run from the worktree root under Node 22:
`export PATH="$HOME/AppData/Roaming/nvm/v22.14.0:$PATH"`.

**Abbreviations.**
- `AIW` = `pnpm --filter @intelliflow/ai-worker exec vitest run`. It runs inside `apps/ai-worker` with that package's vitest config.
- `ROOTV` = `npx vitest run --project root`.

**CSV status during planning.** The CSV stays `In Progress`. `tools/scripts/lib/workflow/config.ts:64` does not allow
`In Progress → Planning` or `→ Plan Complete`. The plan phase is recorded in
`.specify/sprints/sprint-18/attestations/IFC-117/task-tracking.json` instead. At exec Phase 5 the target status is `Needs Human`
(see S25).

## Preflight Checks

1. [ ] Worktree is clean apart from install churn in `Sprint_plan_I.csv` and `Sprint_plan_J.csv`. Under the owner's
   generated-file ruling, the coordinator restores those, and they are never staged. Check with `git status --porcelain`.
2. [ ] `pnpm install --frozen-lockfile` has run in this worktree. It ran on 2026-10-25.
3. [ ] Confirm that `@opentelemetry/sdk-node@0.219.0` pins `@opentelemetry/sdk-metrics` at exactly `2.8.0`:
   `node -e "console.log(require('./node_modules/.pnpm/@opentelemetry+sdk-node@0.219.0_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-node/package.json').dependencies['@opentelemetry/sdk-metrics'])"`.
   The test-engineer verified it (line 68).
4. [ ] **CSV status `Needs Human` accepted?** Grep `tools/scripts/split-sprint-plan.ts`, the CSV validators under
   `tools/scripts/`, `apps/project-tracker/docs/metrics/schemas/*.json`, and `.claude/hooks/csv-status-guard.mjs`
   for the status enum. Record the result in the delivery report. If any of them rejects `Needs Human`, the S25
   fallback applies: the status stays `In Progress` and the reason is recorded.
5. [x] **Grafana lib signature.** `tools/scripts/lib/grafana-provisioning.mjs` exports `createApiClient`, `querySeriesCount`
   and `buildAlertRulePayload`; the plan reviewer verified this.
   - env-008-ai-c7 answered on 2026-10-25: the signatures stay. `createApiClient` gains an optional 4th argument,
     `{ sleep }`, and retries HTTP 503 eight times over about 255 s.
   - It also gains new exports, `RETRY_DELAYS_MS` and `redactBody`. These are not on main yet, so the sibling script
     does not import them.
   - Their dashboard job applies only `dashboard-production.json`, using the config shape
     `{ folderUid, dashboard }` (see S21).
   - The rule group `intelliflow-prod` must never be reused.
6. [ ] **Null tolerance.** Read `apps/project-tracker/app/api/tracking/ai/route.ts` and
   `apps/project-tracker/components/tracking/AIMetrics.tsx`. Record whether null `current_*`, `current_hours` and
   `status` fields render as "—"/"pending" without NaN or "undefined%". The answer decides whether S22 includes a
   tolerant change.
7. [ ] **Consumers by import path.** Grep by import path, not by name, for consumers of `getAllMetrics`,
   `getDriftMetrics`, `getROIMetrics`, `getLatencyMetrics`, `getHallucinationMetrics` and `../metrics/prometheus-exporter`:
   `git grep -nE "from ['\"].*(monitoring|metrics/prometheus-exporter|drift-detector|roi-tracker|latency-monitor|hallucination-checker)['\"]" -- apps packages`.
   Then filter the results for those symbols. `packages/platform` has its own, unrelated `getAllMetrics`.
8. [ ] **Coverage exclusions.** None of the files touched in S11–S18 may appear in the coverage exclusions at
   `vitest.config.ts:377-404`. Check with `sed -n 370,410p vitest.config.ts`.
9. [ ] **Baseline green on main** for the suites this plan touches. Record the counts:
   `AIW src/monitoring src/chains src/jobs/__tests__/feedback-analytics.job.test.ts src/metrics` and
   `ROOTV tools/scripts/__tests__/apply-grafana-alert-rules.test.ts apps/project-tracker/__tests__/tracking/ai-api.test.ts apps/project-tracker/__tests__/tracking/AIMetrics.test.ts`.
10. [ ] **Coverage before.** Run the `/exec-coverage IFC-117 before` snapshot, scoped to `apps/ai-worker/src/monitoring/**`,
    `apps/ai-worker/src/chains/scoring.chain.ts` and `apps/ai-worker/src/jobs/feedback-analytics.job.ts`.
    Output goes to `artifacts/coverage/IFC-117-before.json`.
11. [ ] **Where the global-wiring test lives** (decided up front, per the test-engineer).
    - Production paths are tested through the facade seam `__setMeterForTests`.
    - ONE small global-wiring test lives in the normal suite: `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.global.test.ts`.
      It calls `metrics.disable()`, asserts `setGlobalMeterProvider(p) === true`, then asserts that the aliased
      `@opentelemetry/api` reaches the provider.
    - The real-chain test (S5) also installs a global provider and asserts the `true` return.
    - If either fails because of fork-reuse contamination, move only that file under `src/tracing/__tests__/`, which
      is excluded at `apps/ai-worker/vitest.config.ts:32-36`. Add a dedicated
      `pnpm --filter @intelliflow/ai-worker exec vitest run --config vitest.otel.config.ts` invocation to the
      validation matrix. Do not drop the test.

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
| --- | --- | --- | --- |
| `otel-ai-metrics.ts` recorders | `withMonitoring` (`apps/ai-worker/src/monitoring/chain-monitor.ts:197`), reached from `LeadScoringChain.scoreLead` (`chains/scoring.chain.ts:244`), reached from `jobs/scoring.job.ts:220,239,557` | Never-mounted Prometheus text path | `AIW src/chains/__tests__/scoring.chain.otel.integration.test.ts` |
| Outer-catch error count | `LeadScoringChain.scoreLead` catch (`scoring.chain.ts:285-307`) | — | same file, pre-monitoring error case |
| `registerAiMetrics()` (gauges, pre-seed) | `AIWorker.onStart()` (`apps/ai-worker/src/ai-worker.ts:182`) | — | `AIW src/monitoring/__tests__/drift-scheduler.test.ts` (start path) plus `rg -n "registerAiMetrics\(" apps/ai-worker/src/ai-worker.ts` |
| `DriftDetectionScheduler` | `AIWorker.onStart()`, started first; stopped in `onStop()` (`ai-worker.ts:978`) | Nothing. `detectAllDrift` (`drift-detector.ts:326`) had no production caller | `AIW src/monitoring/__tests__/drift-scheduler.test.ts`, `rg -n "DriftDetectionScheduler" apps/ai-worker/src/ai-worker.ts` |
| `recordRetrainingTrigger` | `jobs/feedback-analytics.job.ts:172` (BullMQ cron, `ai-worker.ts:777-789`) | `incrementRetrainingTriggers` in `metrics/prometheus-exporter.ts`, which is deleted | `AIW src/jobs/__tests__/feedback-analytics.job.test.ts`; `rg -n "prometheus-exporter" apps packages` returns nothing |
| `recordDrift:false` | job-level fallback chain (`jobs/scoring.job.ts:233-236`) | Fallback samples polluting drift | `AIW src/jobs/scoring.job.test.ts` (fallback case added in S15) |
| AI alert rules | `.github/workflows/grafana-ai-alert-rules.yml`, running `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs` | `infra/monitoring/ai-prometheus-rules.yaml`, never loaded. It stays untouched because TRACK-004 hashes it | `ROOTV tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts` |
| AI dashboard JSON | ENV-008-AI dashboard job, after its follow-up. Apply is NEEDS_HUMAN (N3) | `infra/monitoring/ai-grafana-dashboard.json`, never loaded. Stays untouched | `ROOTV tools/scripts/__tests__/ai-monitoring-assets.test.ts` |

## Estimated Effort

The CSV estimate is 180/360/720 min, so PERT = (180 + 4·360 + 720)/6 = **390 min (~6.5 h)**.

The plan's own breakdown, which supersedes the CSV figure as a planning note (the CSV estimate is not edited):

| Phase | Estimate |
| --- | --- |
| RED: 8 new test files, 2 fixtures, 10 existing test files rewritten | ~3–4 h |
| GREEN: 4 new source files, 12 source files modified, 3 deleted, 2 infra JSON, 1 script + `.d.mts`, 1 workflow, package and lockfile | ~5–7 h |
| Docs, CSV and artifacts: 9 files | ~1–1.5 h |
| REFACTOR and VALIDATION (full-suite pre-ship, about 25–30 min) | ~1.5–2 h |
| **Total** | **~10.5–14.5 h** |

`Planned Start` (2026-10-06) and `Planned Finish` (2026-10-09) are already set in the CSV, so they are not changed.
The overrun is recorded in the delivery report.

## Files Summary

- **Create (19):**
  - `apps/ai-worker/src/monitoring/otel-ai-types.ts`. Holds the shared types: `ChainId`, `HallucinationOutcome`,
    `DriftTickResult` (`{model, metric, status, detectedTick, onset, severity, score, pValue}`) and the allowlist
    `as const` arrays. It has no runtime dependencies. The facade, `chain-monitor.ts`, `drift-detector.ts` and the tests
    import it, which prevents an import cycle.
  - `apps/ai-worker/src/monitoring/otel-ai-metrics.ts`
  - `apps/ai-worker/src/monitoring/drift-scheduler.ts`
  - `apps/ai-worker/src/monitoring/drift-stats.ts` (pure KS/PSI/binning helpers, free of OTel, per NF-006)
  - `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.test.ts`
  - `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.global.test.ts`
  - `apps/ai-worker/src/monitoring/__tests__/chain-monitor.otel.test.ts`
  - `apps/ai-worker/src/monitoring/__tests__/drift-detector.shift.test.ts`
  - `apps/ai-worker/src/monitoring/__tests__/drift-scheduler.test.ts`
  - `apps/ai-worker/src/chains/__tests__/scoring.chain.otel.integration.test.ts`
  - `infra/monitoring/grafana/cloud/ai-alert-rules.json`
  - `infra/monitoring/grafana/cloud/dashboard-ai-models.json`
  - `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs`
  - `tools/scripts/observability/apply-grafana-ai-alert-rules.d.mts`
  - `.github/workflows/grafana-ai-alert-rules.yml`
  - `tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts`
  - `tools/scripts/__tests__/ai-monitoring-assets.test.ts`
  - `tools/scripts/__tests__/fixtures/ifc-117-legacy/ai-grafana-dashboard.json` (copy, negative control)
  - `tools/scripts/__tests__/fixtures/ifc-117-legacy/ai-prometheus-rules.yaml` (copy, negative control)
- **Modify (33):**
  - `apps/ai-worker/src/monitoring/chain-monitor.ts`
  - `apps/ai-worker/src/monitoring/drift-detector.ts`
  - `apps/ai-worker/src/monitoring/monitoring-flush.service.ts`
  - `apps/ai-worker/src/monitoring/index.ts`
  - `apps/ai-worker/src/monitoring/roi-tracker.ts`
  - `apps/ai-worker/src/monitoring/latency-monitor.ts`
  - `apps/ai-worker/src/monitoring/hallucination-checker.ts`
  - `apps/ai-worker/src/chains/scoring.chain.ts`
  - `apps/ai-worker/src/chains/auto-response.chain.ts`
  - `apps/ai-worker/src/jobs/scoring.job.ts`
  - `apps/ai-worker/src/jobs/feedback-analytics.job.ts`
  - `apps/ai-worker/src/ai-worker.ts`
  - `apps/ai-worker/package.json` and `pnpm-lock.yaml`
  - Test files (10, all under `apps/ai-worker/src/`):
    - `apps/ai-worker/src/monitoring/__tests__/chain-monitor.test.ts`
    - `apps/ai-worker/src/monitoring/__tests__/index.test.ts`
    - `apps/ai-worker/src/monitoring/__tests__/hallucination-checker.test.ts` (`:15`, `:764-790` `getHallucinationMetrics` block)
    - `apps/ai-worker/src/monitoring/__tests__/roi-tracker.test.ts`
    - `apps/ai-worker/src/monitoring/__tests__/monitoring-flush.service.test.ts` (flushed `model` case)
    - `apps/ai-worker/src/monitoring/drift-detector.test.ts`
    - `apps/ai-worker/src/monitoring/drift-detector.additional.test.ts`
    - `apps/ai-worker/src/monitoring/latency-monitor.additional.test.ts`
    - `apps/ai-worker/src/jobs/__tests__/feedback-analytics.job.test.ts`
    - `apps/ai-worker/src/jobs/scoring.job.test.ts` (fallback case at about `:658`)
  - Docs and data (9):
    - `artifacts/metrics/ai-metrics.json`
    - `docs/architecture/diagrams/ai-intelligence-dependency-chain.md`
    - `docs/architecture/diagrams/complete-dependency-chains.md` (`:1390`, `:1422`, `:2153`)
    - `docs/planning/drift-dashboard.md`
    - `docs/planning/plan-change-log.md`
    - `docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md` (status)
    - `docs/architecture/adr/README.md` (ADR-088 row status)
    - `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
    - the regenerated split that holds the IFC-117 row (`Sprint_plan_D.csv`)
  - Conditional, not counted in the 33:
    - From S22: `apps/project-tracker/components/tracking/AIMetrics.tsx`, `apps/project-tracker/app/api/tracking/ai/route.ts`
      and `apps/project-tracker/__tests__/tracking/AIMetrics.test.ts`.
    - From S16, only if the `onStart` change breaks them: `apps/ai-worker/src/__tests__/ai-worker.boot-folded-workers.test.ts`
      and the other `ai-worker.*.test.ts` files.
    - From Preflight 11, only if the global-wiring test cannot run in the normal suite: the test moves under
      `apps/ai-worker/src/tracing/__tests__/`, and a new `apps/ai-worker/vitest.otel.config.ts` is added.
- **Delete (3):**
  - `apps/ai-worker/src/metrics/prometheus-exporter.ts`
  - `apps/ai-worker/src/metrics/__tests__/prometheus-exporter.test.ts`
  - `apps/ai-worker/src/chains/__tests__/scoring-with-monitoring.integration.test.ts`
- **Explicitly NOT touched:**
  - `infra/monitoring/ai-grafana-dashboard.json`, `infra/monitoring/ai-prometheus-rules.yaml`, `infra/monitoring/alerts-config.yaml`
    (TRACK-004, IFC-055 and IFC-142 hash them)
  - `tools/scripts/observability/apply-grafana-alert-rules.mjs`, `.github/workflows/grafana-alert-rules.yml`
    (ENV-008-AI's)
  - `tools/scripts/lib/grafana-provisioning.mjs` (reused read-only)
  - `infra/monitoring/grafana/provisioning/alerting/intelliflow-rules.yaml`, the MTTD rule, the collector and spanmetrics (IFC-074)
  - `packages/observability/src/metrics.ts`
  - The sprint-6 attestations

## Execution Steps

### Phase 1: RED — Write Failing Tests

#### Step 1: Facade unit tests

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.test.ts`

**Harness.** A `MetricReader` subclass with `aggregationTemporalitySelector: () => AggregationTemporality.DELTA`, a no-op
`onShutdown`/`onForceFlush` and no timer. Install it through `__setMeterForTests(provider.getMeter(...))` and reset it
in `afterEach` with `__resetAiMetricsForTests()`, which also unregisters the gauge callbacks.

**Acceptance Criteria Addressed:** AC-009, AC-010 (partly), NF-001, NF-002, NF-003

**Test cases:**
- [ ] Every name, type and unit in `AI_METRIC_DEFINITIONS` matches the spec table. The latency histogram's bucket boundaries equal
  `[50,100,250,500,1000,1500,2000,3000,5000,10000,30000]`.
- [ ] Model normalisation:
  - every `MODEL_PRICING` key round-trips unchanged (parametrised over `Object.keys(MODEL_PRICING)`);
  - `'unknown'`, `'default'`, `undefined`, `''`, `'x:free'`, `'__proto__'`, `'constructor'`, `'toString'` all map to `other`;
  - a dated gateway name maps through `servedPricingKey` (`config/ai.config.ts:313-317`).
- [ ] Runtime allowlist: unknown `metric`, `severity`, `status`, `urgency`, `value_type`, `hallucination_type`, `reason` and `chain` values
  map to `other` (or `unknown` for chain). The allowlist arrays are exhaustive against their unions (a `satisfies` type test).
- [ ] `error_class` classifier:
  - a timeout error gives `timeout`;
  - an HTTP 429 shape gives `rate_limited`;
  - a ZodError or SyntaxError gives `parse`;
  - `class FooTenant123Error`, a non-Error throw, and `{message: CANARY}` all give `other`.
- [ ] Error canary: the canary appears in no attribute. The canary is built at runtime as `['CANARY', 'MARKER', 'a'.repeat(8)].join('_')`.
- [ ] Cardinality: feeding 1,000 random strings into every attribute position keeps the number of distinct series ≤ the computed bound.
  The pre-seeded series count equals the bound for the closed sets.
- [ ] Recorders never throw. With an instrument whose `add`/`record` throws, every `record*` returns normally.
- [ ] `recordConfidence` with NaN, Infinity, −0.1, 1.1, a string or undefined records nothing.
- [ ] `recordCost` for an unknown model records nothing on OTel. For a known model it records the value, including 0.
- [ ] `drift.last_check` is not observed before the first tick, and is observed after `recordDriftTick` (also on an
  `insufficient_data`-only tick).
- [ ] Gauge callbacks that throw do not abort collection.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/otel-ai-metrics.test.ts` FAILS, because the module is missing.

#### Step 2: Global-wiring test

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/monitoring/__tests__/otel-ai-metrics.global.test.ts`

**Acceptance Criteria Addressed:** AC-010

**Test cases:**
- [ ] `metrics.disable()`, then `expect(metrics.setGlobalMeterProvider(provider)).toBe(true)`.
- [ ] One `recordInference` through the production `getMeter` path reaches the reader. This proves that the aliased
  `@opentelemetry/api` (`apps/ai-worker/vitest.config.ts:15-20`) shares the global.
- [ ] `afterAll` awaits `provider.shutdown()`, then calls `metrics.disable()`.
- [ ] Static check: no non-test file under `apps/ai-worker/src` imports `initMetrics`. It walks the files with `fs` and a
  regex, so it does not depend on shell grep and stays Windows-safe (NF-009).

**Validation:**
- [ ] `AIW src/monitoring/__tests__/otel-ai-metrics.global.test.ts` FAILS.

#### Step 3: `withMonitoring` call-site tests

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/monitoring/__tests__/chain-monitor.otel.test.ts`

**Acceptance Criteria Addressed:** AC-002, AC-003, AC-004, AC-008

**Test cases:**
- [ ] Success records:
  - an inference with `outcome=success` and latency;
  - a confidence, only when the result carries a raw `confidence` (no default 1);
  - a cost, only when usage is present and the model is known;
  - an estimated value equal to `roiTracker.recordValueByType(...).estimatedValue`, only when `valueType` is passed, with a
    debug log when it is absent.
- [ ] Drift sample = score/100 for `score: 1` (gives 0.01, which fixes `:228`) and for `score: 72` (gives 0.72).
  `recordDrift:false` records no sample.
- [ ] `HallucinationOutcome`:
  - checked + hallucinated gives `checks+1`, `detected+1` and `types` per type;
  - checked and not hallucinated, but with types present, gives `checks+1` and no `types`;
  - skipped (`no_context`, `no_text`, `too_short`) gives `skipped{reason}` only;
  - a checker error gives `skipped{reason:error}`.
- [ ] `MonitoredResult.metrics.hallucinated` is `true`, `false` or `null`.
- [ ] Error path:
  - `outcome=error` with a classified `error_class`;
  - the error is rethrown;
  - no drift sample, no value and no hallucination record.
- [ ] Direct `hallucinationChecker.checkOutput(...)` calls do not move the call-site counters (the AC-004 path at
  `ai-worker.ts:1253`).
- [ ] A throwing instrument leaves the chain result unchanged (NF-003).

**Validation:**
- [ ] `AIW src/monitoring/__tests__/chain-monitor.otel.test.ts` FAILS.

#### Step 4: Drift statistics tests

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/monitoring/__tests__/drift-detector.shift.test.ts`

**Harness.** A local seeded `mulberry32` generator; never `Math.random`. Time is pinned with
`vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(...)`, restored in `afterEach`.

**Acceptance Criteria Addressed:** AC-005, AC-007

**Test cases:**
- [ ] Pure shift is detected. Same spread, mean shifted by at least 2σ, n ≥ 200 per window. Expect a detected tick and
  severity ≥ medium. This fails today because of per-window bin edges (`drift-detector.ts:392-398`).
- [ ] No-shift control: the same distribution gives no detection, with p > 0.2.
- [ ] Exact KS statistic on a small hand-computed sample: D equals the literal.
- [ ] KS with ties: tied integer scores are evaluated at distinct values, so D is not inflated.
- [ ] Real n: an equal shift gives a smaller p at n=2000 than at n=20. This fails today because n is fixed at 100 (`:438`).
- [ ] PSI null calibration at n=25/m=50: over 200 seeded null draws, the mean excess PSI is below 0.1.
- [ ] False-positive rate: across 200 seeded null windows, detected ticks ≤ 5 at α=0.01, with margin.
- [ ] Gate boundaries:
  - all four combinations of (p < 0.01 or not) × (excess PSI ≥ 0.1 or D ≥ 0.1, or not);
  - the severity band edges at exactly 0.1, 0.2, 0.25 and 0.5 for PSI, and 0.1, 0.2, 0.3 and 0.5 for D.
- [ ] Persistence:
  - three consecutive detected ticks give ONE onset;
  - a 4th detected tick gives no new onset;
  - three clear ticks end the event;
  - a new shift gives a second onset.
- [ ] Reference windows: the reference is the same 6h slice on days −1..−7 and never overlaps the current 6h window.
  Below 50 reference or 25 current samples the status is `insufficient_data`, never `none` (AC-007).
- [ ] Retention: samples older than 8d are pruned. The per-key cap keeps the newest 50,000. The per-sample record is O(1):
  pruning is amortised and happens on tick.
- [ ] Structured keys: a model name containing `:` round-trips. `DriftResult.model` is set, and so is `DriftResult.status`.
- [ ] `driftHistory` is capped at 7d.
- [ ] `user_satisfaction` and `user_correction_error` are not evaluated by the scheduled path.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/drift-detector.shift.test.ts` FAILS on the shift, real-n, persistence and reference cases.

#### Step 5: Scheduler tests

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/monitoring/__tests__/drift-scheduler.test.ts`

**Acceptance Criteria Addressed:** AC-006

**Test cases:**
- [ ] `vi.useFakeTimers()`. `afterEach` calls `vi.useRealTimers()` and stops the scheduler.
- [ ] `start()` creates one interval of 30 min, and calling it twice is idempotent. There is no run at boot.
- [ ] `vi.advanceTimersByTimeAsync(30*60_000)` calls `detectAllDrift` once and `recordDriftTick` once.
- [ ] A throwing `detectAllDrift` is logged, and the next tick still fires.
- [ ] Re-entrancy: while a tick awaits a pending promise, a second interval does not start a second run.
- [ ] `stop()` leaves `vi.getTimerCount() === 0`, and later advances produce no calls.
- [ ] The interval handle has been `unref`'d.
- [ ] Captured-logger leak test: a seeded run's sample values, distributions and recommendations never appear in the log
  output. Only the fixed fields do.
- [ ] `AIWorker.onStart` ordering, with the AIWorker dependencies mocked using the harness from
  `apps/ai-worker/src/__tests__/ai-worker.boot-folded-workers.test.ts`:
  - the scheduler starts even when a later step (`registerScheduledJobs`) throws;
  - `onStop` stops it before the flush service stops.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/drift-scheduler.test.ts` FAILS.

#### Step 6: Real-chain integration test

**Type:** test

**Files to Create:**
- `apps/ai-worker/src/chains/__tests__/scoring.chain.otel.integration.test.ts`

**Acceptance Criteria Addressed:** AC-001, AC-002, AC-008, AC-009, NF-003

**Setup.**
- [ ] `beforeAll`:
  - build the `MeterProvider` and the DELTA reader;
  - call `metrics.disable()`;
  - `expect(metrics.setGlobalMeterProvider(p)).toBe(true)`.
- [ ] `beforeEach`, in this order:
  - `vi.stubEnv('AI_PROVIDER', 'mock')`;
  - `vi.resetModules()`;
  - `vi.stubGlobal('fetch', fakeFetch)`, with `fakeFetch` built inside `beforeEach`;
  - `vi.mock('../../utils/cost-tracker')`, or disable cost tracking (`lib/usage-metering.ts:60-62`);
  - dynamically import `../scoring.chain`, `../../lib/llm-factory` and `../../monitoring`;
  - `__resetFactoryCache()`;
  - `vi.spyOn(chainMonitor, 'getConfig').mockReturnValue(createChainMonitor().getConfig())`;
  - `new LeadScoringChain({ provider: 'mock' })`.
- [ ] `afterEach`: collect and discard.
- [ ] `afterAll`: `await provider.shutdown()`, then `metrics.disable()`.

**Fake fetch.**
- [ ] It returns an OpenAI `chat.completion` whose `message.content` is a JSON string valid against `leadScoreSchema`.
  - Factors have reasoning of at least 10 characters.
  - `usage: { prompt_tokens: 2000, completion_tokens: 500 }`.
- [ ] Request assertion: the body's `response_format.type === 'json_schema'`. The structured-output method is `jsonSchema`
  for `scoring-free` (`@langchain/openai` `base.js:472-476`).

**Guards.**
- [ ] `result.score > 0`.
- [ ] `result.modelVersion !== 'error:v1'`.
- [ ] `fetch` called exactly once.
- [ ] No `outcome=error` data point.

**Assertions**, from one `reader.collect()`:
- [ ] latency histogram count = 1 for `{model:'scoring-free', chain:'lead_scoring', outcome:'success'}`;
- [ ] inference count = 1;
- [ ] cost ≈ the literal `2000/1000·0.00005 + 500/1000·0.00008 = 0.00014` (from `config/ai.config.ts:235`), checked with
  `toBeCloseTo(0.00014, 9)`;
- [ ] estimated value = 0.5 (`roi-tracker.ts:683`);
- [ ] confidence recorded once;
- [ ] hallucination checks = 1, so the check ran.

**Further cases.**
- [ ] Leak guard: `JSON.stringify` of all data points contains none of the lead email canary, the operationId pattern, or the
  reasoning text.
- [ ] Error case: the fake fetch returns HTTP 500, so the chain returns `error:v1`. Expect an `outcome=error` point, no value,
  no drift sample, and no hallucination check.
- [ ] Pre-monitoring error: make `createLLMForTenant` or the prompt resolution throw. Expect exactly one `outcome=error`,
  `error_class=other` point from the outer catch; the "already counted" flag prevents a double count.
- [ ] Concurrency: `Promise.all` of 2 calls gives 2 latency points and a cost of exactly 2 × 0.00014.
- [ ] `result.modelVersion` starts with the chain's own provider (`mock:`), not with `aiConfig.provider`. This fixes
  `scoring.chain.ts:212`.
- [ ] Fallback path: `new LeadScoringChain({ provider: 'mock', recordDrift: false })` gives no drift sample and still gives
  an inference point. The job-level wiring is unit-tested in `apps/ai-worker/src/jobs/scoring.job.test.ts` in S15.

**Validation:**
- [ ] `AIW src/chains/__tests__/scoring.chain.otel.integration.test.ts` FAILS.

#### Step 7: Alert-rules sibling script tests

**Type:** test

**Files to Create:**
- `tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts`

**Acceptance Criteria Addressed:** AC-012, NF-007, NF-008

**Test cases:**
- [ ] The committed `infra/monitoring/grafana/cloud/ai-alert-rules.json` passes `validateConfig` (returns `[]`).
- [ ] UIDs are pinned exactly: `ifc117-hallucination-rate`, `ifc117-drift-shift`, `ifc117-drift-stalled`,
  `ifc117-inference-p95-latency`, `ifc117-inference-error-ratio`, `ifc117-ai-metrics-silent`.
- [ ] Every rule has `requireSeries: false` and `noData: "OK"`.
- [ ] Folder and group are `intelliflow-ai`. A config using the IFC-032 values from `infra/monitoring/grafana/cloud/alert-rules.json`
  (read live) is rejected.
- [ ] Thresholds come from the exported thresholds config (NF-007). The hallucination expression contains `>= bool 0.05`.
- [ ] Negative cases:
  - a missing field;
  - a bad operator;
  - a duplicate uid;
  - a uid without the `ifc117-` prefix;
  - unsafe `uid`, `folder.uid`, `group.name` or `datasourceUid` values: `a/../b`, `?x`, `#x`, ` x`.
- [ ] Parity test. The original `SAFE_PATH_SEGMENT` is NOT exported: it is a `const` at
  `tools/scripts/observability/apply-grafana-alert-rules.mjs:49`, and that file must not be edited.
  - The test reads the file with `fs` and extracts the regex literal with
    `/const SAFE_PATH_SEGMENT = (\/.+\/[a-z]*);/`.
  - It asserts that the extracted source equals the sibling's exported `SAFE_PATH_SEGMENT.source`.
  - A negative case feeds the extractor text without the const and expects it to throw ("parity source not found"), so
    a rename in ENV-008-AI's rewrite fails loudly instead of passing vacuously.
- [ ] Fake Grafana `fetchImpl`, modelled on the `fakeGrafana` helper in `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`:
  - the folder is created on a 404;
  - the rules are PUT or POSTed and only the `intelliflow-ai` group is PUT;
  - nothing is ever deleted;
  - there is no delivery test.
- [ ] `--dry-run`:
  - writes nothing;
  - runs the series check AND an instant query per `expr`;
  - an HTTP error or `status:'error'` on any expr fails the run with the rule uid named;
  - empty results pass under `requireSeries:false`.
- [ ] Token hygiene, with the token built at runtime as `'x'.repeat(24)` and the host `grafana.example.invalid`:
  - a missing token throws a message that does not contain the token;
  - a 401 response with a body echo leaves neither the token nor `Authorization` in the thrown message or the logs;
  - error text is truncated to 200 characters.
- [ ] Workflow YAML contract (`.github/workflows/grafana-ai-alert-rules.yml`, parsed as YAML):
  - `on` has only `push` (branches `[main]`, paths = the rules file, the script, the workflow, `tools/scripts/lib/grafana-provisioning.mjs`)
    and `workflow_dispatch` with input `dry_run`;
  - no `pull_request` or `pull_request_target`;
  - `permissions: {contents: read}`;
  - `environment: Production`;
  - `GRAFANA_SA_TOKEN` appears only in a step `env:`;
  - the sparse-checkout includes `infra/monitoring/grafana/cloud`, `tools/scripts/observability` and `tools/scripts/lib`;
  - `actions/checkout@v7`, `actions/setup-node@v7`, node `'24'`;
  - the concurrency group is `grafana-ai-alert-rules`;
  - `timeout-minutes` is at least 12. ENV-008-AI's `createApiClient` will retry HTTP 503 eight times over about 255 s,
    according to env-008-ai-c7 on 2026-10-25.
- [ ] Error text is redacted locally. ENV-008-AI's `redactBody` is not on main yet, so the sibling script must not import
  it. Issue 13 in S26 switches it over after that lane merges.

**Validation:**
- [ ] `ROOTV tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts` FAILS.

#### Step 8: Static cross-check of instruments vs dashboard and rules

**Type:** test

**Files to Create:**
- `tools/scripts/__tests__/ai-monitoring-assets.test.ts`
- `tools/scripts/__tests__/fixtures/ifc-117-legacy/ai-grafana-dashboard.json` (copy of `infra/monitoring/ai-grafana-dashboard.json`)
- `tools/scripts/__tests__/fixtures/ifc-117-legacy/ai-prometheus-rules.yaml` (copy of `infra/monitoring/ai-prometheus-rules.yaml`)

**Acceptance Criteria Addressed:** AC-013

**Test cases:**
- [ ] Registered instruments are DERIVED, not listed twice: run every `record*` once against an in-memory reader and
  collect `descriptor.name`, `type` and `unit`.
  - The test imports the ai-worker facade by relative path. If the root project cannot resolve the
    `@opentelemetry/sdk-metrics` devDependency there, fall back to importing the exported `AI_METRIC_DEFINITIONS`, plus a
    facade test (S1) asserting that the definitions equal the collected descriptors.
- [ ] A golden table of OTel → Prometheus pairs, hard-coded and marked ASSUMPTION in the header. Examples:
  - `intelliflow.ai.inference.latency` (ms, histogram) → `intelliflow_ai_inference_latency_milliseconds_{bucket,sum,count}`
  - counters → `_total`
  - unit-less gauges → no suffix
- [ ] A PromQL tokenizer extracts metric identifiers from every `expr` and `selector` in `ai-alert-rules.json`, and from every
  panel target in `dashboard-ai-models.json`.
  - `names.length > 0` per expression.
  - It is checked against a known tricky expression first: the span gate with `histogram_quantile`, `by (le)`, label matchers
    and `or vector(0)`.
- [ ] Every extracted name is a golden translation of a registered instrument, or the allowed span-gate metric
  `traces_spanmetrics_calls_total`.
- [ ] Every label used in a rule or panel selector is in the facade allowlist, or is a resource or span label
  (`job`, `service`, `span_name`, `le`).
- [ ] Negative control: the same checker run over both legacy fixtures FAILS (expects ≥1 violation each).
- [ ] The dashboard JSON parses and has ENV-008-AI's config shape: `{ folderUid: 'intelliflow-prod', dashboard: { uid, title, panels } }`.
  - Top-level keys are exactly `folderUid` and `dashboard`. There is no `overwrite` and no `message`, because their apply
    script adds those.
  - `dashboard.uid === 'ifc117-ai-models'`.
  - No panel has an `id`.
  - Every target has `datasource: { uid: 'grafanacloud-prom' }`.
- [ ] Spec §6 notes are present as panel descriptions or titles:
  - the ROI panel says "estimated" and shows "n/a" when cost is 0 (its expression guards the zero denominator);
  - the hallucination panel says "detected by heuristic checker";
  - a text or description mentions the timeout double-count;
  - a text or description says auto-response is not monitored in production.
- [ ] The header comment states that this cannot prove the live Grafana names (N5).

**Validation:**
- [ ] `ROOTV tools/scripts/__tests__/ai-monitoring-assets.test.ts` FAILS, because the files are missing.

#### Step 9: Retraining-trigger job test rewrite

**Type:** test

**Files to Modify:**
- `apps/ai-worker/src/jobs/__tests__/feedback-analytics.job.test.ts` (mock at `:28-31` moves to `../../monitoring/otel-ai-metrics`)

**Acceptance Criteria Addressed:** AC-011

**Test cases:**
- [ ] A breach calls `recordRetrainingTrigger({urgency})` once with the job's urgency.
- [ ] No breach means no call.
- [ ] An unknown urgency is still passed through; the facade clamps it, as tested in S1.

**Validation:**
- [ ] `AIW src/jobs/__tests__/feedback-analytics.job.test.ts` FAILS, because the import is missing.

### Phase 2: GREEN — Make Tests Pass

#### Step 10: Dependency

**Type:** implementation

**Files to Modify:**
- `apps/ai-worker/package.json`: devDependency `"@opentelemetry/sdk-metrics": "2.8.0"` (exact)
- `pnpm-lock.yaml`

**Validation:**
- [ ] `pnpm install` succeeds.
- [ ] `pnpm --filter @intelliflow/ai-worker why @opentelemetry/sdk-metrics` shows only 2.8.0 for ai-worker.
- [ ] The lockfile diff is limited to that entry.
- [ ] Note: the lockfile change widens local pre-ship to the full suite (`scripts/pre-ship.mjs:259-262`). Budget ~25–30 min.

#### Step 11: OTel facade

**Type:** implementation

**Files to Create:**
- `apps/ai-worker/src/monitoring/otel-ai-types.ts`, created first. Its import rule: it may use `import type` only (from
  `./hallucination-checker` for `HallucinationType` and from `./roi-tracker` for the value types), and it has no
  runtime import from any module. The allowlist arrays it holds are runtime constants built from literals. It holds:
  - `ChainId` and `HallucinationOutcome`;
  - `DriftTickResult`, the shape the facade consumes. `drift-detector.ts` will produce it in S12.
  - the allowlist `as const` arrays.
- `apps/ai-worker/src/monitoring/otel-ai-metrics.ts`. It imports only from `otel-ai-types.ts`, `../config/ai.config` and
  `@opentelemetry/api`. Interfaces exactly as in the spec ("Interfaces & Contracts"), plus
  `__setMeterForTests`, `__resetAiMetricsForTests`, `AI_METRIC_DEFINITIONS` and the exported thresholds config
  (`AI_ALERT_THRESHOLDS = { hallucinationRate: 0.05, latencyP95Ms: 2000, errorRatio: 0.05 }`, NF-007).

**Validation:**
- [ ] `AIW src/monitoring/__tests__/otel-ai-metrics.test.ts src/monitoring/__tests__/otel-ai-metrics.global.test.ts` PASS.
- [ ] `pnpm --filter @intelliflow/ai-worker typecheck` exits 0.

#### Step 12: Drift statistics and detector

**Type:** implementation

**Files to Create:**
- `apps/ai-worker/src/monitoring/drift-stats.ts`. Pure functions with no OTel import (NF-006):
  - `fixedBins`, with smoothing;
  - `excessPsi`;
  - `ksTwoSample(a, b) → {d, p}`, tie-aware, using the full Kolmogorov series;
  - `severityFrom`;
  - `isDetectedTick`.

**Files to Modify:**
- `apps/ai-worker/src/monitoring/drift-detector.ts`:
  - structured `{model, metric}` keys;
  - retention of 8d with a per-key cap of 50,000 and amortised pruning (`pruneOnTick()`);
  - reference windows matched on time of day;
  - the persistence state machine and onset reporting;
  - `DriftResult` is extended with `model`, `status`, `detectedTick`, `onset` and `severity`, so that it structurally
    satisfies `DriftTickResult` from `./otel-ai-types`. `detectAllDrift()` returns these extended results, and the
    scheduler passes them to `recordDriftTick` unchanged. The S4 "Structured keys" case adds a compile-time check:
    `const _check: DriftTickResult = result satisfies DriftTickResult`;
  - `driftHistory` capped at 7d;
  - removal of the `(1-p)·0.5` scoring at `:288`;
  - `setBaseline` kept.
- `apps/ai-worker/src/monitoring/monitoring-flush.service.ts` (lines 84): `model: dr.model`.
- `apps/ai-worker/src/monitoring/__tests__/monitoring-flush.service.test.ts`: write this case RED first. It asserts that
  the flushed drift event's `model` equals `DriftResult.model`, not the metric name.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/drift-detector.shift.test.ts` PASS.
- [ ] Rerun `AIW src/monitoring/drift-detector.test.ts src/monitoring/drift-detector.additional.test.ts src/monitoring/__tests__/monitoring-flush.service.test.ts`.
  Update the assertions that encode the old formula, and record each changed assertion in the delivery report.

#### Step 13: Drift scheduler

**Type:** implementation

**Files to Create:**
- `apps/ai-worker/src/monitoring/drift-scheduler.ts`. `DriftDetectionScheduler(detector, { intervalMs, log })`:
  - `start()` and `stop()`;
  - `setInterval(...).unref()`;
  - a re-entrancy guard and try/catch;
  - each tick calls `pruneOnTick` → `detectAllDrift` (metrics `score_distribution` and `confidence_level` only) →
    `recordDriftTick` → a fixed-field log.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/drift-scheduler.test.ts` PASS, except the `onStart` ordering case, which closes in S16.

#### Step 14: `withMonitoring` changes

**Type:** implementation

**Files to Modify:**
- `apps/ai-worker/src/monitoring/chain-monitor.ts`:
  - `MonitoringContext` gains `chain`, `valueType` and `recordDrift`;
  - `HallucinationOutcome` and `ChainId` are imported from `./otel-ai-types`, never redefined;
  - the recorders are called as specified;
  - `computeTokenCost` returns `number | null`;
  - `HallucinationOutcome`;
  - `MonitoredResult.metrics.hallucinated`;
  - score/100;
  - the hard-coded `lead_scored` is removed and replaced by a debug log when `valueType` is absent.
- `apps/ai-worker/src/monitoring/__tests__/chain-monitor.test.ts` (lines 350-366): rewrite to pass `valueType`, and add a
  context-less case asserting that no value is booked.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/chain-monitor.otel.test.ts src/monitoring/__tests__/chain-monitor.test.ts src/monitoring/__tests__/chain-monitor.metrics-fidelity.test.ts` PASS.

#### Step 15: Chain and job wiring

**Type:** implementation

**Files to Modify:**
- `apps/ai-worker/src/chains/scoring.chain.ts`:
  - context `{chain:'lead_scoring', valueType:'lead_scored'}`;
  - a constructor option `recordDrift?: boolean` (default `true`), as in `new LeadScoringChain({ provider, recordDrift: false })`,
    forwarded into the `withMonitoring` context;
  - `modelVersion` from the chain's own provider (`:212`);
  - an outer-catch `recordInference(error, other)` guarded by an "already counted" flag.
- `apps/ai-worker/src/chains/auto-response.chain.ts` (lines 248): `{chain:'auto_response'}`.
- `apps/ai-worker/src/jobs/scoring.job.ts` (lines 233-236): `new LeadScoringChain({ …, provider: fallbackProvider, recordDrift: false })`.
- `apps/ai-worker/src/jobs/scoring.job.test.ts`: add a case next to the existing fallback case (about `:658`) asserting that
  the fallback chain is constructed with `recordDrift: false`. Write it RED first.

**Validation:**
- [ ] `AIW src/chains/__tests__/scoring.chain.otel.integration.test.ts src/chains/scoring.chain.test.ts src/jobs/scoring.job.test.ts src/jobs/__tests__` PASS.

#### Step 16: Worker lifecycle

**Type:** implementation

**Files to Modify:**
- `apps/ai-worker/src/ai-worker.ts`:
  - in `onStart()`, right after `loadAIConfig()` and inside its own try/catch: `registerAiMetrics()`, then
    `this.driftScheduler = new DriftDetectionScheduler(driftDetector, …); this.driftScheduler.start()`;
  - in `onStop()` (`:978`): stop the scheduler before `monitoringFlushService.stop()`.

**Validation:**
- [ ] `AIW src/monitoring/__tests__/drift-scheduler.test.ts src/__tests__/ai-worker.boot-contact-embed.test.ts src/__tests__/ai-worker.boot-folded-workers.test.ts src/__tests__/ai-worker.supplementary2.test.ts src/__tests__/ai-worker.tenant-ai-spend-wiring.test.ts`
  PASS. These rerun the existing lifecycle tests. If any of them needs an update for the new `onStart` calls, it is added
  to the Modify list and the delivery report.

#### Step 17: Retraining counter and exporter deletion

**Type:** implementation

**Files to Modify:**
- `apps/ai-worker/src/jobs/feedback-analytics.job.ts` (lines 22,172): `recordRetrainingTrigger`; comments at `:10` and `:81` updated.

**Files to Delete:**
- `apps/ai-worker/src/metrics/prometheus-exporter.ts`
- `apps/ai-worker/src/metrics/__tests__/prometheus-exporter.test.ts`

**Validation:**
- [ ] `AIW src/jobs/__tests__/feedback-analytics.job.test.ts` PASS.
- [ ] `git grep -n "prometheus-exporter\|default-dev-token\|METRICS_TOKEN" -- apps packages` returns nothing. Sprint-6
  history, generated artifacts and the CSV are handled in S25.

#### Step 18: Remove the Prometheus text path

**Type:** implementation. One commit, with its tests.

**Files to Modify:**
- `apps/ai-worker/src/monitoring/index.ts`: remove `getAllMetrics` and export the facade.
- `apps/ai-worker/src/monitoring/drift-detector.ts`, `apps/ai-worker/src/monitoring/roi-tracker.ts`,
  `apps/ai-worker/src/monitoring/latency-monitor.ts` and `apps/ai-worker/src/monitoring/hallucination-checker.ts`: remove
  the `get*Metrics` text builders.
  Do this only for the symbols that Preflight 7 proved have no non-test consumer.
- Tests:
  - `apps/ai-worker/src/monitoring/__tests__/index.test.ts` (lines 95,145-154)
  - `apps/ai-worker/src/monitoring/drift-detector.additional.test.ts` (lines 841-883)
  - `apps/ai-worker/src/monitoring/latency-monitor.additional.test.ts` (lines 752-799)
  - `apps/ai-worker/src/monitoring/__tests__/roi-tracker.test.ts` (lines 1106-1155)
  - `apps/ai-worker/src/monitoring/__tests__/hallucination-checker.test.ts` (lines 15) (import) and `:764-790` (`describe('getHallucinationMetrics')`)

  Remove the text-builder cases. Keep `getMonitoringStatus` and every other case.

**Validation:**
- [ ] `AIW src/monitoring` PASS.
- [ ] `pnpm --filter @intelliflow/ai-worker typecheck` exits 0.

#### Step 19: Fake-green and flaky tests

**Type:** implementation

**Files to Delete:**
- `apps/ai-worker/src/chains/__tests__/scoring-with-monitoring.integration.test.ts`. It runs a simulated chain at `:44-61`.
  Any case worth keeping was ported to S6 first, and the port is listed in the delivery report.

**Files to Modify:**
- `apps/ai-worker/src/monitoring/drift-detector.test.ts` (lines 262-290): replace the `Math.random` / `toBeDefined` test with a seeded,
  asserting one, or remove it in favour of S4, and say which.

**Validation:**
- [ ] `AIW src/chains src/monitoring` PASS.

#### Step 20: AI alert rules, script and workflow

**Type:** implementation

**Files to Create:**
- `infra/monitoring/grafana/cloud/ai-alert-rules.json`: six rules as specified, with folder and group `intelliflow-ai`.
  - Resource selector: `job=~"(.*/)?(intelliflow-)?ai-worker"`.
  - Span gate: `service=~"(intelliflow-)?ai-worker", span_name=~"llm.*"`.
  - The stalled rule uses `time() - max(intelliflow_ai_drift_last_check) > 7200` with `for: 30m`.
  - The latency rule has a ≥10-call gate. The error ratio has a ≥10-call gate. The hallucination rule has a ≥20-check gate.
  - `or vector(0)` and `clamp_min` are used where the spec requires them.
- `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs`:
  - `run({ env, argv, fetchImpl, log })`;
  - copied `validateConfig` and `SAFE_PATH_SEGMENT`, both EXPORTED and declared in the `.d.mts`, so the S7 parity test can
    read `SAFE_PATH_SEGMENT.source`;
  - `datasourceUid` validation, the uid prefix, and rejection of the IFC-032 folder and group;
  - folder GET, then POST on a 404;
  - the series check plus an instant query per `expr` on `--dry-run`;
  - PUT of the group `intelliflow-ai` only;
  - truncation and redaction (local, not ENV-008-AI's `redactBody`);
  - `createApiClient` called with its current 3 arguments;
  - a minimal `main` guard.
- `tools/scripts/observability/apply-grafana-ai-alert-rules.d.mts`, following the precedent of `apply-grafana-alert-rules.d.mts`.
- `.github/workflows/grafana-ai-alert-rules.yml`, matching the S7 contract.

**Validation:**
- [ ] `ROOTV tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`
  PASS. The second file is unchanged.
- [ ] `node tools/scripts/security/workflow-secret-lint.mjs` exits 0.
- [ ] `actionlint .github/workflows/grafana-ai-alert-rules.yml` exits 0, if it is installed; this is advisory in pre-ship.

#### Step 21: AI dashboard JSON

**Type:** implementation

**Files to Create:**
- `infra/monitoring/grafana/cloud/dashboard-ai-models.json`
  - Shape, as confirmed by env-008-ai-c7 on 2026-10-25: `{ "folderUid": "intelliflow-prod", "dashboard": { "uid": "ifc117-ai-models", "title", "panels": [...] } }`.
    There is no `overwrite`/`message`, because their script adds them. Panels have no `id`, and every target uses
    `datasource: { uid: 'grafanacloud-prom' }`.
  - Their apply job reads only `dashboard-production.json`, so applying this file stays NEEDS_HUMAN (N3) until their
    multi-file follow-up lands (issue 8).
  - Panels as in spec §6.

**Validation:**
- [ ] `ROOTV tools/scripts/__tests__/ai-monitoring-assets.test.ts` PASS.

#### Step 22: `ai-metrics.json` and the TRACK-004 consumer

**Type:** implementation

**Files to Modify:**
- `artifacts/metrics/ai-metrics.json`:
  - keep the `kpis.*` keys;
  - set measured fields (`current_*`, `status`, `drift_detection.current_hours`) to `null`;
  - set `status` to `"NEEDS_HUMAN"`, with `evidence_ref` → spec N1–N7;
  - correct `measurement_method` to match spec §3;
  - leave `$schema` untouched.
- Conditional, only if Preflight 6 found a NaN or "undefined%" render: a minimal null-tolerant change in
  `apps/project-tracker/components/tracking/AIMetrics.tsx` and/or `apps/project-tracker/app/api/tracking/ai/route.ts`, with a case
  added to `apps/project-tracker/__tests__/tracking/AIMetrics.test.ts`.

**Validation:**
- [ ] `ROOTV apps/project-tracker/__tests__/tracking/ai-api.test.ts apps/project-tracker/__tests__/tracking/AIMetrics.test.ts` PASS.

### Phase 3: REFACTOR — Clean Up

#### Step 23: Refactor

**Type:** implementation

**Files to Modify:**
- All files from S11–S22. Remove duplication: `drift-stats.ts` holds every statistic, and the facade holds every attribute rule.
- Keep comment density matching the surrounding code.

**Validation:**
- [ ] `pnpm --filter @intelliflow/ai-worker lint` exits 0.
- [ ] `npx eslint tools/scripts/observability/apply-grafana-ai-alert-rules.mjs tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts tools/scripts/__tests__/ai-monitoring-assets.test.ts` exits 0.
- [ ] `npx prettier --check` on every changed file exits 0.
- [ ] `pnpm --filter @intelliflow/ai-worker typecheck` exits 0.

### Phase 4: VALIDATION, DOCS, CSV

#### Step 24: Docs and ADR

**Type:** documentation

**Files to Modify:**
- `docs/architecture/diagrams/ai-intelligence-dependency-chain.md`. At `:23`, `:393-437` and `:546-550`, IFC-117 changes to
  "In Progress → Needs Human": OTel export and scheduled drift added, production verification pending. Note that
  DriftDetector had no production caller before this change.
- `docs/architecture/diagrams/complete-dependency-chains.md`. At `:1390`, `:1422` and `:2153`, change IFC-117's ✅ to
  "Needs Human / production unverified". Update it in the same commit as the domain chain file. Also grep `docs/` for any
  other "IFC-117 … ✅/COMPLETED" claims and fix them minimally.
- `docs/planning/drift-dashboard.md`
  - Rewrite with the real panels, metric names, label allowlist, rules and definitions, and
  no invented figures. Name the canonical files and the superseded ones. Add a Limitations section: lead scoring only, global
  scope, ROI estimated, warm-up, and the KPIs remaining unproven until N1–N7.
- The ADR status is NOT changed here. That happens in S28, after final validation.

**Validation:**
- [ ] `npx prettier --check` on these files exits 0.
- [ ] `pnpm validate:docs-integrity` (`tsx tools/scripts/docs-integrity-audit.ts`) exits 0.

#### Step 25: CSV rebaseline (Category B) and status

**Type:** documentation and data

**Files to Modify:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`, row IFC-117, canonical file only, edited with the Edit tool
  (never inline PowerShell):
  - `ARTIFACT:` entries:
    - `apps/ai-worker/src/metrics/prometheus-exporter.ts` → `apps/ai-worker/src/monitoring/otel-ai-metrics.ts`
    - `infra/monitoring/ai-grafana-dashboard.json` → `infra/monitoring/grafana/cloud/dashboard-ai-models.json`. Recorded as
      committed, not delivered, until N3.
    - `infra/monitoring/ai-prometheus-rules.yaml` → `infra/monitoring/grafana/cloud/ai-alert-rules.json`
  - `EVIDENCE:` adds `.specify/sprints/sprint-18/attestations/IFC-117/attestation.json`.
  - The DoD text is unchanged.
  - The TRACK-004 row (`:340`) is unchanged.
  - Status: `Needs Human` at exec Phase 5, if Preflight 4 confirmed it is accepted. Otherwise it stays `In Progress`, with the
    reason recorded.
- `docs/planning/plan-change-log.md`: the old → new entries, the evidence, the in-envelope rationale and the review reference.
- Regenerated splits: `npx tsx tools/scripts/split-sprint-plan.ts`. Only the IFC-117 split should change. The install churn
  in `_I`/`_J` is not staged.

**Validation:**
- [ ] Run `npx tsx tools/scripts/validate-artifacts.ts IFC-117` AFTER the S27 attestation exists. The spec keeps the CSV
  swap minimal (option (b) from plan review iteration 2), so this script is EXPECTED to exit 1: it fails on any CSV-only or
  plan-only path (`tools/scripts/validate-artifacts.ts:545`). No gate requires it to pass: it is referenced only as a
  helper in the exec-gates references, and not by `scripts/pre-ship.mjs` or `tools/scripts/exec-preflight/`.
  The delivery report records its full output and checks it equals EXACTLY this expected set:
  - **Plan-only** (deliberately not in the CSV; the CSV tracks deliverables, not every file):
    - the new test files and the two fixtures;
    - `otel-ai-types.ts`, `drift-stats.ts` and `drift-scheduler.ts`;
    - the sibling script, its `.d.mts` and the workflow;
    - every file in the Modify list that the CSV does not name.
  - **Plan-only** also includes every existing file this plan modifies that the CSV does not name. Examples are
    `apps/ai-worker/package.json`, `pnpm-lock.yaml`, `chain-monitor.ts` and `Sprint_plan.csv`. They are listed in full in
    the report.
  - **CSV-only** (intended). The script reads only the row's `ARTIFACT:` and `EVIDENCE:` entries, not `FILE:`. Its CSV-only
    output is exactly:
    - `infra/monitoring/alerts-config.yaml`, which stays listed, on disk and untouched (superseded in the docs);
    - `.specify/sprints/sprint-6/attestations/IFC-117/attestation.json`, the historical sprint-6 `EVIDENCE:` entry, kept
      on purpose.
    - `docs/planning/drift-dashboard.md` is "Both", not CSV-only, because the S24 bullet is formatted as a bare path.
  - **Missing on disk:** none, in the post-exec state (S27 item 6). Every new file exists by then, including the sprint-18
    `attestation.json`.

  Any path outside this set is a real finding and is fixed before the push.
- [ ] Also run `node tools/scripts/exec-preflight/check-exec-readiness.mjs IFC-117` and record that it accepts the outcome
  (it does not call `validate-artifacts`).
- [ ] `pnpm validate:sprint-data` exits 0.
- [ ] `node tools/scripts/audit/phantom-completed-audit.mjs` shows no new finding.

#### Step 26: Follow-up issues

**Type:** governance. Done at PR time, so each issue can link the PR.

Issues are filed with `gh issue create` using a body file, with no AI attribution:
1. health-server `/metrics` unauthenticated, plus the `error.message` leak
2. unwrapped chains and agents (auto-response has no call site)
3. per-tenant drift via the DB tier; global drift is visible to all tenants; ROI and cost rows are tenant-null
4. outcome-based ROI (owner)
5. deprecate the GBP `intelliflow.ai.inference.cost`
6. unbounded `hallucinationChecker.results`
7. hydrate drift samples from the DB at boot
8. ENV-008-AI dashboard job: multi-file support and an `intelliflow_ai_*` allowlist
9. extract the shared Grafana validation into the lib
10. retire the old AI dashboard, rules and alerts files with the TRACK-004, IFC-055 and IFC-142 owners
11. CSV DoD wording on 5% (owner)
12. `context-hydration.ts:308` returns 0 patterns on Windows
13. switch the IFC-117 sibling Grafana script to ENV-008-AI's `redactBody`/retry once that lane merges

The delivery report also records a spec deviation (INFO): `drift-stats.ts` and `otel-ai-types.ts` are not in the spec's
Components table. They were added to satisfy NF-006 (statistics free of OTel imports) and to avoid an import cycle.

Each issue is first checked against existing ones (`gh issue list --search`). This is the anti-spam rule.

#### Step 27: Final validation

**Type:** validation

Everything that must reach the pushed commit is done BEFORE the single push. This avoids a second push and a second full
pre-ship (plan review iteration 2). The order is:

1. [ ] **Validation matrix.** Run every row below except pre-ship, and record each exit code and duration in the delivery
   report.
2. [ ] **Coverage after.** Run `/exec-coverage IFC-117 after`, which writes `artifacts/coverage/IFC-117-after.json`.
   Targets: new modules ≥95% lines; `chain-monitor.ts` and the changed `drift-detector.ts` code ≥90% branches.
3. [ ] **Clean exit.** `COVERAGE_RUN=1 pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring src/chains src/jobs`
   exits 0. There must be no "Unhandled error" or "Unhandled rejection" (`forceExit` is off in this mode).
4. [ ] **ADR status (S28).** Only if items 1–3 are all green.
5. [ ] **Attestation (AC-015).** Create `.specify/sprints/sprint-18/attestations/IFC-117/attestation.json` via `/exec-attestation`.
   - It records the provable ACs with real command results.
   - It lists N1–N7 from the spec table, each with **who**, **query/command** and **pass threshold**, plus the promotion
     follow-up's owner and date.
   - It cites no unit test as KPI proof.
   - The verdict is NEEDS_HUMAN while N1–N7 are open.
   - It passes `npx tsx tools/scripts/validate-schemas.ts` and
     `node tools/scripts/exec-preflight/check-attestation-provenance.mjs IFC-117`.
   - The sprint-6 attestations stay untouched.
   - Gate 4b (worktree landed, `tools/scripts/exec-preflight/check-worktree-landed.mjs`) fails for TWO reasons, and the
     attestation records it as `passed:false` naming both:
     - the branch is not pushed yet at attestation time;
     - the branch name `feat/IFC-117-ai-model-monitoring` does not match `^agent\/[A-Z]+-\d+(-.+)?$`. The coordinator set
       that name.

     Both are disclosed in the PR. IFC-033 #1013 used the same disclosure for its branch name. Rewriting the attestation
     after the push would need a second push, which the coordinator forbids.
6. [ ] **CSV status and S25 validation.** Set `Needs Human` (or keep `In Progress`, per Preflight 4). Regenerate the
   splits, then run `pnpm validate:sprint-data`. Run `npx tsx tools/scripts/validate-artifacts.ts IFC-117` and compare it
   to the S25 expected set.
7. [ ] **Secret scan.** `bash .gitleaks/scan.sh staged` exits 0. Run it before every commit.
8. [ ] **Commit** with `git commit -F <file>`. Use no `git add -A`, and stage named files only.
9. [ ] **Single push, with pre-ship.** One run, in the exclusive slot, on an ephemeral DB, with hooks:
   `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-117-push --exclusive intelliflow-pre-ship -- pnpm test:db:run --seed -- git push origin feat/IFC-117-ai-model-monitoring`.
   Expect the full suite (lockfile change, about 25–30 min). Then run `pnpm preship:attest` and confirm
   `refs/preship/<sha>` with `git ls-remote`. If pre-ship re-dirties generated files, name them to the coordinator for a
   restore. Do not reroute.
10. [ ] **No merge of main** until the scanner fix lands on main, per the coordinator.

#### Step 28: ADR status

**Type:** documentation. Runs inside S27, as item 4, and only if items 1–3 are green, so it lands in the single pushed
commit.

**Files to Modify:**
- `docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md`: Status `Proposed` → `Accepted`, with a note that
  production verification (N1–N7) is NEEDS_HUMAN.
- `docs/architecture/adr/README.md`: the ADR-088 row status becomes `Accepted`.

**Validation:**
- [ ] `npx prettier --check docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md docs/architecture/adr/README.md` exits 0.

## Validation Matrix

| Scope | Purpose | Command |
| --- | --- | --- |
| New ai-worker tests | AC-001 to AC-011, NF-001 to NF-006 | `pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring/__tests__/otel-ai-metrics.test.ts src/monitoring/__tests__/otel-ai-metrics.global.test.ts src/monitoring/__tests__/chain-monitor.otel.test.ts src/monitoring/__tests__/drift-detector.shift.test.ts src/monitoring/__tests__/drift-scheduler.test.ts src/chains/__tests__/scoring.chain.otel.integration.test.ts` |
| Touched ai-worker suites | Regressions | `pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring src/chains src/jobs src/lib src/__tests__/ai-worker.boot-contact-embed.test.ts src/__tests__/ai-worker.boot-folded-workers.test.ts src/__tests__/ai-worker.supplementary2.test.ts src/__tests__/ai-worker.tenant-ai-spend-wiring.test.ts` |
| Docs | Integrity | `pnpm validate:docs-integrity` |
| Sprint data | CSV | `pnpm validate:sprint-data` |
| ai-worker full | Package regression | `pnpm --filter @intelliflow/ai-worker test` |
| New tools tests | AC-012, AC-013 | `npx vitest run --project root tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts tools/scripts/__tests__/ai-monitoring-assets.test.ts` |
| Untouched IFC-032 script | Proves no disturbance | `npx vitest run --project root tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/lib/grafana-provisioning.test.ts` |
| Project-tracker consumer | AC-014 | `npx vitest run --project root apps/project-tracker/__tests__/tracking/ai-api.test.ts apps/project-tracker/__tests__/tracking/AIMetrics.test.ts` |
| Clean exit | NF-005 | `COVERAGE_RUN=1 pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring src/chains src/jobs` |
| Workflow secrets | NF-008 | `node tools/scripts/security/workflow-secret-lint.mjs` |
| Secret scan | NF-008 | `bash .gitleaks/scan.sh staged` |
| Types | TypeScript | `pnpm run typecheck` (turbo, slot) |
| Lint | Lint | `pnpm run lint` (turbo, slot) |
| Build | Build | `pnpm run build` (turbo, slot) |
| CSV/plan | S25. Expected to exit 1 with exactly the S25 expected set, recorded. | `npx tsx tools/scripts/validate-artifacts.ts IFC-117` |
| Exec preflights | Gates | `node tools/scripts/exec-preflight/check-exec-readiness.mjs IFC-117`, `node tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs IFC-117`, `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs IFC-117`, `node tools/scripts/exec-preflight/check-nav-wiring.mjs IFC-117` |
| Pre-ship | Full gate | the slot-wrapped push in S27 |

## Integration Checkpoints Summary

| After Step | Verification | Command |
| --- | --- | --- |
| 9 | RED: all new tests fail for the right reason, and the failure messages are recorded | the new-test row of the matrix (expect failures) |
| 11 | Facade green, types compile | `pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring/__tests__/otel-ai-metrics.test.ts src/monitoring/__tests__/otel-ai-metrics.global.test.ts` and `pnpm --filter @intelliflow/ai-worker typecheck` |
| 13 | Drift and scheduler green | `pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring/__tests__/drift-detector.shift.test.ts src/monitoring/__tests__/drift-scheduler.test.ts src/monitoring/__tests__/monitoring-flush.service.test.ts` |
| 16 | Real chain green, lifecycle wired | `pnpm --filter @intelliflow/ai-worker exec vitest run src/chains/__tests__/scoring.chain.otel.integration.test.ts src/monitoring/__tests__/drift-scheduler.test.ts src/jobs/scoring.job.test.ts src/__tests__/ai-worker.boot-folded-workers.test.ts` |
| 19 | Exporter and text path gone, suites green | `pnpm --filter @intelliflow/ai-worker exec vitest run src/monitoring src/chains src/jobs` plus `git grep -n prometheus-exporter -- apps packages` |
| 22 | Infra, assets and consumer green | the tools and project-tracker rows of the matrix |
| 23 | Quality | ai-worker lint and typecheck, prettier |
| 27 | Everything | the full matrix plus the clean exit plus pre-ship |
| 28 | ADR accepted | `npx prettier --check docs/architecture/adr/ADR-088-ai-model-monitoring-otel-export.md docs/architecture/adr/README.md` |

## Traceability (AC/NF → Step)

| Requirement | Steps |
| --- | --- |
| AC-001 | 6, 11, 14, 15 |
| AC-002 | 3, 6, 14 |
| AC-003 | 3, 14 |
| AC-004 | 3 |
| AC-005 | 4, 12 |
| AC-006 | 5, 13, 16 |
| AC-007 | 4, 12 |
| AC-008 | 3, 6, 14 |
| AC-009 | 1, 6, 11 |
| AC-010 | 2 |
| AC-011 | 9, 17, 18 |
| AC-012 | 7, 20 |
| AC-013 | 8, 21 |
| AC-014 | 22, 24 |
| AC-015 | 25, 27 (attestation checkbox: N1–N7 with who/query/threshold, promotion owner and date) |
| NF-001 | 1 |
| NF-002 | 1, 5, 6 |
| NF-003 | 1, 3 |
| NF-004 | 11 (synchronous records only) |
| NF-005 | 2, 5, 6, 27 |
| NF-006 | 12 |
| NF-007 | 7, 11 |
| NF-008 | 1, 7, 27 |
| NF-009 | 2, 8 |
| NF-010 | 27 |

## Plan-Reviewer Sign-off

- **Iteration 1** (plan-reviewer subagent, 2026-10-25): **REVISE**. 8 errors, 8 warnings and 3 info items. All were
  applied:
  - Files Summary and effort counts.
  - The `hallucination-checker.test.ts` text-builder block.
  - The lifecycle test paths in `src/__tests__/ai-worker.*.test.ts`.
  - Feasibility of the `SAFE_PATH_SEGMENT` parity test (read with `fs`, not exported).
  - The `scoring.job.test.ts` target.
  - `complete-dependency-chains.md` added.
  - The ADR README, plus the ADR status moved to S28.
  - The types home in `otel-ai-types.ts`.
  - Exact checkpoint commands and script names (`validate:docs-integrity`, `validate:sprint-data`).
  - The `alerts-config.yaml` reconciliation note.
  - The flush `model` RED test.
  - The `recordDrift` constructor signature and the `modelVersion` assertion.
  - The AC-015 attestation checkbox.
  - The dashboard note assertions.
  - The conditional files.
  - The spec-deviation note.

  ENV-008-AI's answers (dashboard config shape, `timeout-minutes` ≥ 12, local redaction) were folded in at the same time.
- **Iteration 2:** REVISE, 2 errors, 4 warnings and 2 info items. All were applied:
  - (1) `validate-artifacts` result: option (b) chosen. It is expected to exit 1 with an exact recorded set, and no gate
    requires it.
  - Plan bullets normalised to full paths with no line suffixes, which removes the phantom paths.
  - (2) S27 reordered so the ADR flip, attestation, CSV status, commit and the single push all happen in one sequence.
    Gate 4b is disclosed.
  - (3) `otel-ai-types.ts` import rule: `import type` only, with runtime constant arrays.
  - (4) `DriftResult` extended to satisfy `DriftTickResult`, with a compile-time check.
  - (5) `SAFE_PATH_SEGMENT` exported, and declared in the `.d.mts`.
  - (6) Dashboard shape deviation from spec §6 recorded below.
  - (7) Cite corrected to `:233-236`.

  **Spec deviation (recorded for the delivery report):** spec §6 defaulted the dashboard to "a bare dashboard model". The
  plan uses ENV-008-AI's confirmed config shape, `{folderUid, dashboard}` (env-008-ai-c7, 2026-10-25). Their job and
  `dashboard-production.json` are not on main yet. Issue 8 stays open.
- **Iteration 3:** **APPROVED_WITH_CHANGES**.
  - The one remaining ERROR, the S25 expected set, has been fixed:
    - CSV-only is `alerts-config.yaml` plus the sprint-6 `attestation.json`;
    - `drift-dashboard.md` is now "Both", via the S24 bare-path bullet;
    - the reviewer's run showed the script reads no `FILE:` entries;
    - "Missing: none" applies only to the post-exec state.
  - INFO, also applied: Gate 4b's second failure reason, the branch name, is named.
  - The reviewer stated that no further full pass is needed for an S25-only edit.

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (.claude/agents/plan-reviewer.md), 3 iterations: REVISE (8E/8W/3I) → REVISE (2E/4W/2I) → APPROVED_WITH_CHANGES (1E fixed, 3I). Transcript in this lane's session log (2026-10-25).
