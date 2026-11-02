# IFC-117 Spec Discussion Log

Task: IFC-117, "Monitor AI models for drift, latency, hallucination and ROI" (Sprint 18, reopened 2026-10-05)
Repo root: `C:/Users/talys/projects/intelliFlow-CRM-worktrees/ifc-117` (branch `feat/IFC-117-ai-model-monitoring`, from origin/main d8bf93c40)
Mode: subagent (5 agents). Phase 0.75 exploration and Round 1 ANALYSIS ran together in Explore subagents, which used tools.

## Coordinator scope (Aurora GO, 2026-10-24 and 2026-10-25)

1. Record drift, hallucination rate, latency and cost/ROI through OTel from the real production path (the `withMonitoring` chains), so they ride the OTLP export. Prefer the existing `intelliflow.ai.*` instruments. Add a test that drives a real chain call and asserts that the instrument recorded something. Mount or delete the dead prometheus-exporter path.
2. No manual Grafana Cloud changes. Dashboards and alert rules are repo files, applied by the same CI path that applies the existing alert rules. A separate AI rule group is allowed. Do not touch `intelliflow-rules.yaml`, the MTTD rule, or the collector/spanmetrics (IFC-074). If no CI path applies dashboards, report it as NEEDS_HUMAN.
3. The sprint-6 PARTIAL attestations stay as history. A fresh spec, plan and attestation go in the sprint-18 structure.
4. "Drift within 1 day" and "hallucination <5%" need production data. Until that data exists, the attestation is NEEDS_HUMAN, and unit tests are not used as proof.
5. Full ceremony.

## Phase 0 / 0.5 / 0.9 / 0.95 / 0.97 (lead)

- **Hydration.** Output is in `.specify/sprints/sprint-18/context/IFC-117/hydrated-context.{json,md}`, hash `8ad64da7…`. The codebase-pattern step returned 0 patterns: `context-hydration.ts:308` shells out to `grep … 2>/dev/null`, and cmd.exe on Windows cannot run that. The exploration agents covered patterns instead.
- **Agents.** ai-specialist, devops-lead, security-lead, domain-expert, test-engineer (`IFC-117-agent-selection.json`).
- **Dependency chain.** `docs/architecture/diagrams/ai-intelligence-dependency-chain.md:23,393-437` lists IFC-117 as "COMPLETED ✅". That entry is stale and must be corrected in this task.
- **Dependency deep check.**
  - IFC-005: TRUE. `scoring.chain.ts` exists and the confidence field is at `apps/api/src/shared/scoring-output-schema.zod.ts:24`.
  - AUTOMATION-002: TRUE as files only (`artifacts/metrics/metrics-realtime.json`, `infra/monitoring/optimization-loop.yaml` (14 lines, a DORA config), `artifacts/reports/roi-tracking.csv`). Its "dashboard showing AI impact" is a static JSON file, not a live dashboard. That gap is IFC-117's own subject, so it does not block.
- **CSV status.** It stays "In Progress". `tools/scripts/lib/workflow/config.ts:58-71` does not allow `In Progress → Specifying`. The spec phase is recorded in `task-tracking.json` instead.
- **ADR.** None covers OTel export of AI metrics. ADR-043 (DB persistence) and ADR-052 (Redis snapshot) cover the in-app path. ADR-088 is the next free number: ADR-084 to 087 are taken on main or in other lanes (ifc-074 has 086, env-008-ai has 087). PRD: N/A (no user-facing feature; the in-app pages PG-146/152/153 already exist).

## Round 1: ANALYSIS (agent findings, condensed; full outputs in the session transcript)

### AI-Specialist
- Only `scoring.chain.ts:244-259` uses `withMonitoring` with full context in production (callers at `jobs/scoring.job.ts:220,239,557`). The `withMonitoring` call in `auto-response.chain.ts:245-249` has no context, and `AutoResponseChain` has no production instantiation; it is only re-exported (`index.ts:176`, `chains/index.ts:20`).
- **Drift is never detected.** `detectDrift`/`detectAllDrift` (`drift-detector.ts:236,326`) have no production caller, so `driftHistory` stays empty and the drift gauges and flush stay empty too.
- **Drift math defects.**
  - Each window's histogram uses its own min/max (`:392-398`), so a pure shift is invisible.
  - The KS p-value uses a fixed n=100 (`:438`).
  - The baseline is frozen after first compute (`:260`), while samples roll off after 48h (`:125`).
  - The current window can overlap the baseline (`:223` vs `:266`).
- **Hallucination.** The `hallucinated` boolean (`hallucination-checker.ts:249-250`) is not the same as the type flags (`:139-145`). `withMonitoring` returns only the types (`chain-monitor.ts:184`). The singleton is also fed by `ai-worker.ts:1168,1253` (a second check on every job's JSON output, label `litellm-proxy`) and by the insight/prediction jobs. A rate taken from `getStats()` is contaminated, so it must be counted at the `withMonitoring` call site.
- **ROI.** Every success books `lead_scored` (`chain-monitor.ts:241-245`). Cost is recorded only when >0 (`:142`), so free-tier ROI = 0. Currency: OTel cost instrument is GBP (`packages/observability/src/metrics.ts:243`), but pricing is USD (`ai.config.ts:169`, `roi-tracker.ts:47`).
- **`initMetrics`.** It is never called in ai-worker. It uses a gRPC exporter and sets its own global provider, which would conflict with NodeSDK. Use the `@opentelemetry/api` global meter instead.
- **Coverage gap.** churn-risk, sentiment, ticket-routing, insight-generation, rag and embedding chains, and all agents, are not wrapped. Only `llm-tracer.ts:58` (spans) sees every LLM call.

### DevOps-Lead
- **NodeSDK already exports metrics.** In sdk-node 0.219, an empty `OTEL_METRICS_EXPORTER` falls back to otlp (`sdk.js:29-33`), readers come from env (`:172-175`), and a global MeterProvider is set (`:208-219`). The protocol is http/protobuf (`utils.js:351-363`). Production env (Terraform): endpoint `https://otlp-gateway-prod-gb-south-1.grafana.net/otlp` (`environments/production/terraform.tfvars:153`), protocol http/protobuf (`modules/monitoring/main.tf:26-29`), headers from a secret (`main.tf:16-18`). Precedent: `apps/api/src/tracing/query-budget-otel.ts:42-53` (`metrics.getMeter(...)` from startTracing).
- **Alert CI.**
  - `grafana-alert-rules.yml` triggers on push to main for `alert-rules.json`, the script and the workflow (`:16-19`), and on dispatch (`dry_run`, `send_test`).
  - `apply-grafana-alert-rules.mjs` hard-codes the rules path (`:26-36`), handles a single folder/group, and always deletes `deliveryTest.uid` (`:157-160`).
  - The series check fails the run, after applying, when a rule has 0 series and `requireSeries !== false` (`:110-118,162-166`).
  - Precedent for one config + one script + one workflow: `synthetic-monitoring.yml` (dispatch-only).
- **No CI applies dashboards.** There is nothing in workflows, scripts or Terraform (`modules/monitoring/main.tf:49,58-64` only writes the path into a manifest). This is NEEDS_HUMAN.
- **Dead names.** `ai-grafana-dashboard.json` and `ai-prometheus-rules.yaml` query `intelliflow_ai_*` names. Those names exist only as hand-built Prometheus text served by the never-mounted exporter, so they never reach Grafana Cloud.
- **OTel→Prom name translation** (dots→`_`, unit suffixes, `_total`) cannot be checked from the repo. Verify it with a `dry_run` series check after deploy.
- **Service label mismatch.** `alert-rules.json:11` uses `service="ai-worker"`, but the code default is `intelliflow-ai-worker` (`otel.ts:48`).

### Security-Lead
- **prometheus-exporter.**
  - It fails open: the default token is `'default-dev-token'` (`:69-71`).
  - The comparison uses `replaceAll('Bearer ')` with `===`, which is not constant-time (`:78-79`).
  - The status handler has no auth (`:141-155`).
  - The urgency label is raw (`:47`).

  Recommendation: delete the HTTP handlers and move `incrementRetrainingTriggers` (caller `feedback-analytics.job.ts:22`) to an OTel counter.
- **Health server.** `health-server.ts` `/metrics` and the other endpoints are unauthenticated (`:82-100,187-193`), and the 500 path leaks `error.message` (`:212`). Whether the Railway port is public cannot be verified from the repo. This is out of scope; file it as an issue.
- **Label policy.**
  - Allowlist only: `model` (logical key, unknown → `other`), `chain` (enum), `operation_type`, `hallucination_type` (closed union `hallucination-checker.ts:20-28`), `value_type` (closed enum `roi-tracker.ts:22-35`), `outcome`.
  - Never: `operationId`, `tenantId`, `leadId`, raw `error.name`, `inputContext`, `output`, `evidence`, ROI `metadata`, `error.message`.
  - `sanitizeMetricLabel` does not bound cardinality.
- **Grafana token.** Handling is sound: env-scoped secret, never printed, path segments validated. Residuals: Admin scope, `datasourceUid` not validated (`grafana-provisioning.mjs:37`).

### Domain-Expert
- **History.** The 2026-02 attestation claimed 6/6 KPIs met from config and tests, with no measurement. `attestation-latest` (2026-03) says 0/5 DoD met.
- **Wrong evidence file.** `infra/monitoring/drift-detection-config.yaml` covers Terraform infra drift, not model drift, and must not be cited.
- **`docs/planning/drift-dashboard.md`** is a mock-up with invented figures (94.2% accuracy, 2.3% hallucination, 340% ROI).
- **ROI is synthetic.** It is $0.50 per scored lead (`roi-tracker.ts:683`) against about $0.00005/1k tokens, so ROI comes out around 10^5–10^6 % and a ">200%" target means nothing. A real ROI needs outcomes (`Lead.convert()` / `LeadConvertedEvent`, IFC-024 feedback).
- **What users already have.** The in-app pages PG-146/152/153 read `ai-monitoring.router.ts` through Redis and the DB. Drift shows nothing because detection never runs. Tenant attribution is always null (`monitoring-flush.service.ts:95,117-183`).
- **Ambiguities.**
  - "targets: >=5%" (CSV) contradicts the KPI "<5%".
  - The definition of drift (score vs confidence vs outcomes), and whether it is per-tenant or global.
  - The ROI definition and its 200% target.
  - Whether the `score:0` error fallback counts as quality.

### Test-Engineer
- **The existing test is fake-green.** `chains/__tests__/scoring-with-monitoring.integration.test.ts:44-61` uses `simulateScoringChain`, never `LeadScoringChain`.
- **No OTel instruments in ai-worker yet.** `@opentelemetry/sdk-metrics` is not an ai-worker dependency; `packages/observability` has `^2.8.0`.
- **Model for the real chain test.** `lib/__tests__/usage-metering.test.ts:275-321` uses a real `ChatOpenAI` with a fake fetch that returns `usage`.
- **Traps:**
  - `scoreLead` swallows errors into `score:0`/`error:v1` (`scoring.chain.ts:285-307`).
  - A mocked factory never fires `handleLLMEnd`, so cost stays 0.
  - The factory cache needs `__resetFactoryCache()`.
  - `bodySafeFetch` is created at module load (`llm-factory.ts:135`).
  - Global OTel state contamination is why `src/tracing/__tests__/**` is excluded (`vitest.config.ts:32-36`).
  - Reader or provider timers can cause an exit 1 on a green run (`docs/runbooks/preship-guards.md:45-59`).

  Assert real data points (name, value, attributes), and shut the provider down in `afterEach`.
- **Rules-file test model.** `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts:49-126,169-192`.

## Coordinator answers after Round 1 (Aurora, 2026-10-25)

1. **Drift is in scope.** Use real scheduled detection, shared bin edges, and a KS test with real sample sizes. Add a test that proves a pure shift is detected.
2. **ROI keeps the estimated value.** Label it "estimated", in USD, with separate cost and value counters. Outcome-based ROI becomes a follow-up issue for the owner.
3. **Alert at a hallucination rate of 5% or more.** The spec notes the ambiguity between the CSV text ("targets: >=5%") and the KPI ("<5%").
4. **AI alert rules get a sibling script and workflow.** They reuse `tools/scripts/lib/grafana-provisioning.mjs`, with `requireSeries: false` until promotion.
   - Do NOT touch `apply-grafana-alert-rules.mjs` or `grafana-alert-rules.yml`: ENV-008-AI (lane env-008-ai-c7) is editing them (retry/redaction, and splitting the workflow into alert-rules/slos/dashboard jobs).
   - mttd-rule has merged (#1017).
5. **Dashboards: no second dashboard-apply path.** Commit the IFC-117 dashboard JSON. Mark its apply as NEEDS_HUMAN, to ride ENV-008-AI's dashboard job once that merges. If the file layout matters, ask env-008-ai-c7 and copy the coordinator.
6. **Delete `prometheus-exporter.ts`.** Fail-open auth on a dead path means delete it, not mount it. Say so in the PR.
7. **File issues** for: the unauthenticated health-server `/metrics` and its error leak, the unwrapped chains and agents, and per-tenant drift.

## Round 2: PROPOSAL, condensed, with lead reconciliation (the unified draft design for Round 3)

All five agents proposed read-only, with file:line citations. Their full outputs are in the session transcript. Where they disagreed, the lead's decision is marked **[LEAD]**.

### D-1. Recording facade (AI-Specialist + Security-Lead)
- **New module.** `apps/ai-worker/src/monitoring/otel-ai-metrics.ts` is the ONLY code that creates instruments or attribute objects.
  - Meter: `metrics.getMeter('intelliflow-ai-worker-monitoring')` from `@opentelemetry/api`, on the NodeSDK global provider. Pattern: `apps/api/src/tracing/query-budget-otel.ts:42-53`. It never calls `initMetrics`.
  - Instruments are lazily created and memoized, with `__resetAiMetricsForTests()`.
  - Every recorder is wrapped in try/catch and never throws into a chain.
- **Attribute allowlist.** Recorder inputs are typed only.
  - `model`: a key of `MODEL_PRICING` (`ai.config.ts:198`, checked with `Object.hasOwn`), otherwise `other`.
  - `chain`: `lead_scoring|auto_response|unknown`.
  - `outcome`: `success|error`.
  - `error_class`: `timeout|rate_limited|parse|other`.
  - `hallucination_type`: the union at `hallucination-checker.ts:20-28`.
  - `value_type`: `roi-tracker.ts:22-35`.
  - `urgency`: `none|low|medium|high|critical`.
  - `metric`: `DriftMetricType`.
  - `status`: `evaluated|insufficient_data`.
  - `reason`: the hallucination skip reason.
  - The `as const` arrays carry `satisfies` exhaustiveness checks.
  - NEVER used as attributes: operationId, tenantId, leadId, error.message, inputContext, output, evidence, ROI metadata.
- **Instruments.** Reused names keep the same type and unit as `packages/observability/src/metrics.ts:231-249`. That package is left untouched.
  - `intelliflow.ai.inference.latency`: histogram, ms, explicit buckets [50,100,250,500,1000,1500,2000,3000,5000,10000,30000] through `advice.explicitBucketBoundaries`.
  - `intelliflow.ai.inference.count`: counter; model, chain, outcome, error_class.
  - `intelliflow.ai.confidence`: histogram, no unit. Recorded only when the confidence is finite.
  - NEW `intelliflow.ai.cost.usd`: counter, no unit. The GBP `intelliflow.ai.inference.cost` histogram is NOT reused; an issue will deprecate it.
  - NEW `intelliflow.ai.value.estimated.usd`: counter; chain, value_type.
  - NEW `intelliflow.ai.hallucination.checks` and `.detected`: counters; model, chain.
  - NEW `.types`: counter; recorded only when hallucinated=true.
  - NEW `.skipped`: counter; chain, reason.
  - NEW `intelliflow.ai.drift.score`: observable gauge, no unit.
  - NEW `intelliflow.ai.drift.detections`: counter; model, metric, severity. **[LEAD]** A counter rather than a 0/1 gauge, because a counter survives scrape gaps.
  - NEW `intelliflow.ai.drift.checks`: counter; status.
  - NEW `intelliflow.ai.drift.last_check`: observable gauge, epoch seconds, no unit.
  - NEW `intelliflow.ai.retraining.triggers`: counter; urgency.
  - **[LEAD]** Gauges carry no unit, so the translated names do not get `_ratio`.
- The expected Prometheus names (dots become `_`, counters get `_total`, ms becomes `_milliseconds`) are an ASSUMPTION. The post-deploy `dry_run` series check verifies them, and that check is NEEDS_HUMAN.

### D-2. `withMonitoring` (`chain-monitor.ts`)
- **Context.** `MonitoringContext` gains `chain?` and `valueType?`.
  - Remove the hard-coded `lead_scored` at `:241-245`. Value is booked only when the caller passes `valueType`.
  - `scoring.chain.ts` passes `{chain:'lead_scoring', valueType:'lead_scored'}`.
  - `auto-response.chain.ts:248` passes `{chain:'auto_response'}`.
- **Success path.**
  - `recordInference(success)` runs right after latency is measured.
  - Then `recordConfidence`.
  - `recordCost(usd)` runs whenever usage is present, including 0. The ROI tracker keeps its `>0` guard.
  - `recordEstimatedValue` records the exact `AIValue.estimatedValue` returned by `roiTracker.recordValueByType` (`roi-tracker.ts:203`).
- **Hallucination.**
  - `computeHallucinationFlags` returns `HallucinationOutcome`, one of `skipped{reason}`, `error`, or `checked{hallucinated, types}`.
  - `hallucinationFlags: string[]` is kept.
  - `MonitoredResult.metrics` gains `hallucinated: boolean|null`.
  - The rate is counted ONLY here.
- **Error path.**
  - `recordInference(error, error_class)`. No drift sample, value, or hallucination check. The error is rethrown.
  - **[LEAD, per Domain-Expert]** The `score:0`/`error:v1` fallback (`scoring.chain.ts:285-307`) is NOT a quality or drift signal.

### D-3. Drift (AI-Specialist + Domain-Expert; coordinator answer 1)
- **Scheduler.** New `monitoring/drift-scheduler.ts`.
  - Interval: `slidingIntervalMinutes` × 60000, which is 30 min. Uses `setInterval(...).unref()`, with a re-entrancy guard and a try/catch on every tick. It does not run at boot.
  - Each tick runs `detectAllDrift()`, then records checks, detections and last_check.
  - Started in `AIWorker.onStart()`, independent of Prisma. Stopped in `onStop()` before the flush.
  - This is the FIRST production caller of `detectAllDrift`.
- **Detector fixes (`drift-detector.ts`).**
  - (a) **Shared bin edges.** Bounded 0..1 metrics use fixed edges. Unbounded metrics use baseline deciles with open outer bins. The current window is binned with the baseline edges. Fixes `:392-398`.
  - (b) **Exact two-sample KS** on raw values with real n and m (`n_eff=nm/(n+m)`). Fixes `:438`.
  - (c) **Detection rule.** **[LEAD]**
    - `detected = p < pValueThreshold && (PSI ≥ 0.1 || D ≥ 0.1)`.
    - severity = max(PSI band 0.1/0.2/0.25/0.5, D band 0.1/0.2/0.3/0.5).
    - The composite score is for display only.
    - This retires the `(1-p)*0.5` floor at `:288`.
  - (d) **Windows.**
    - Current window = the last 6h.
    - Baseline = the 24h before the current window. It never overlaps the current window and rolls every tick.
    - 30h ≤ 48h retention.
    - `setBaseline` stays.
    - Known limit: slow drift gets absorbed into the rolling baseline.
  - (e) **Other fixes.**
    - Structured `{model,metric}` keys instead of `split(':')`.
    - New `DriftResult.model`.
    - Fix `monitoring-flush.service.ts:84`, which writes `model: dr.metric`.
    - Cap `driftHistory` at 7d.
    - New `DriftResult.status`.
- **"Within 1 day".** The detector runs every 30 min. A full shift crosses the gate in about 1–2h, but only if there are at least about 4 scored leads per hour and at least 50 baseline samples. Otherwise the status is `insufficient_data`. The real figure needs production traffic, so it is NEEDS_HUMAN.
- **Scope.** Drift is measured on the lead score distribution, with confidence as a second `metric`. It is global, not per tenant. The error fallback is excluded.

### D-4. Delete the dead exporter (coordinator answer 6)
- Delete `metrics/prometheus-exporter.ts` and its test.
  - The token falls back to `'default-dev-token'` (`:69-71`).
  - The comparison is not constant-time (`:78-79`).
  - The status handler is unauthenticated (`:141-155`).
- `feedback-analytics.job.ts:22,172` switches to `recordRetrainingTrigger`, and its test mock (`:28-31`) is rewritten.
- **[LEAD]** Also delete `getAllMetrics` (`monitoring/index.ts:108`) and the four Prometheus text builders, but only after the plan confirms no non-test consumer. `getMonitoringStatus` stays.

### D-5. AI alert rules (DevOps-Lead + Security-Lead; coordinator answer 4)
- **New files.**
  - `infra/monitoring/grafana/cloud/ai-alert-rules.json`
  - `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs`
  - `.github/workflows/grafana-ai-alert-rules.yml`
  - `apply-grafana-alert-rules.mjs` and `grafana-alert-rules.yml` are left untouched.
- **Folder and group.** **[LEAD]** Own folder `intelliflow-ai` and own group `intelliflow-ai`. The script rejects the IFC-032 values, so no PUT can ever replace IFC-032 rules.
- **Script.**
  - COPIES `validateConfig` and `SAFE_PATH_SEGMENT`, because the other lane is rewriting that file.
  - Also validates `datasourceUid`.
  - Reuses the lib's `createApiClient`, `querySeriesCount` and `buildAlertRulePayload(entry, config, 'ifc-117')`.
  - No `deliveryTest` and no `send_test`.
  - Every rule is `requireSeries:false` and `noData:"OK"` until promotion. A promotion follow-up flips the core rules.
  - Every expression uses only `intelliflow_ai_*`, except the span-metric gate.
  - Grafana error text is truncated. The token is never printed.
- **Workflow.**
  - Triggers: push on main, path-filtered to the rules file, the script, the workflow and `grafana-provisioning.mjs`; plus `workflow_dispatch{dry_run}`. Never `pull_request` or `pull_request_target`.
  - `environment: Production`, `permissions: contents: read`, its own concurrency group, and the token only in `env:`.
- **Rules.**
  - Hallucination rate ≥5% over 1h, with at least 20 checks. Written as `>= bool 0.05` with operator gt 0. Severity high.
  - Drift: high or critical detections in the last 1d. Severity medium.
  - Drift detector stalled for 2h while spans flow. Severity medium.
  - p95 latency over 2000ms for 10m. Severity medium.
  - Error ratio over 5% with at least 10 calls. Severity high.
  - AI metrics silent while spans flow, for 2h. Severity low.
- **Selectors.**
  - `job=~".*/(intelliflow-)?ai-worker"`. The live service name cannot be checked from the repo: `otel.ts:48` says `intelliflow-ai-worker`, while `alert-rules.json:11` uses `service="ai-worker"`.
  - The span gate copies `service="ai-worker"`.
  - The owner must confirm the live name.

### D-6. Dashboard (coordinator answer 5)
- New `infra/monitoring/grafana/cloud/dashboard-ai-models.json`.
  - uid `ifc117-ai-models`, written as a raw POST /api/dashboards/db body on `grafanacloud-prom`, with no panel ids.
  - Panels: hallucination rate and volume ("detected by checker"); drift score, detections and heartbeat; inference by outcome; latency p50/p95/p99; cost and estimated value in USD, with ROI% computed in PromQL, labelled "estimated", and "n/a" when cost is 0.
  - Applying it is NEEDS_HUMAN, through ENV-008-AI's job. The layout question is pending with env-008-ai-c7.
- **Retire.**
  - Delete `ai-grafana-dashboard.json` and `ai-prometheus-rules.yaml`, after updating `plan-overrides.yaml:2067-2068`, `artifact-registry.ts:1213`, `variables.tf:68` and `infra/monitoring/CLAUDE.md:7`. Check the attestation-integrity guards first.
  - `alerts-config.yaml` (a CSV artifact): check its expressions, then retarget it or mark it superseded.

### D-7. Tests (Test-Engineer)
- **New tests.**
  - `chains/__tests__/scoring.chain.otel.integration.test.ts`: the REAL `LeadScoringChain({provider:'mock'})`.
    - Setup order: `__resetFactoryCache()`, stub the global fetch, then construct the chain. The fake fetch's wire format is calibrated in RED. Usage of 2000/500 tokens gives about 1.4e-4 USD.
    - A per-file global `MeterProvider` with a manual DELTA reader, installed before a dynamic import. `afterAll` calls shutdown and then `metrics.disable()`.
    - Guards against a fake pass: `score>0`, `modelVersion!=='error:v1'`, fetch called exactly once, no error point.
    - Assertions: latency, count, cost, value, confidence and hallucination, with exact attributes.
    - A leak guard, plus an error-path test.
  - `monitoring/__tests__/otel-ai-metrics.test.ts`: names, units, buckets, allowlist. Negatives: unknown model, prototype keys, cardinality bound, error canary, exhaustiveness.
  - `monitoring/__tests__/chain-monitor.otel.test.ts`.
  - `monitoring/drift-detector.shift.test.ts`: seeded. A pure shift is detected (RED today). Also a no-shift control, KS with real n, and the baseline lifecycle.
  - `monitoring/__tests__/drift-scheduler.test.ts`: fake timers; `stop()` leaves 0 timers.
  - `tools/scripts/__tests__/apply-grafana-ai-alert-rules.test.ts`.
  - `tools/scripts/__tests__/ai-monitoring-assets.test.ts`: a static cross-check that every dashboard and rule metric maps to a registered instrument. The check must FAIL on the old dead files.
- **Existing tests.**
  - Delete the fake-green `scoring-with-monitoring.integration.test.ts`.
  - Fix `drift-detector.test.ts:262-290`.
  - Rewrite the feedback-analytics test mock.
- **Dependency and coverage.**
  - `@opentelemetry/sdk-metrics ^2.8.0` becomes an ai-worker devDependency. The lockfile change widens pre-ship to the full suite.
  - Coverage: new modules ≥95%; chain-monitor and the drift changes ≥90% branch.
  - Clean exit is verified under `COVERAGE_RUN=1`.

### D-8. Acceptance (Domain-Expert)
- AC-001 to AC-015 are provable in the PR.
- N1 to N7 are NEEDS_HUMAN after promotion: drift within 1 day; hallucination below 5% measured (at least 200 checks over 7d); dashboard applied; alert applied and delivered; name translation; ROI tracked over 7d; latency series.
- The verdict stays NEEDS_HUMAN until those close. No unit test is cited as KPI proof.
- The CSV "targets: >=5%" is read as the alert boundary, with a target of <5%. The DoD text itself is not edited.

### D-9. Docs
- Correct `ai-intelligence-dependency-chain.md` at `:23`, `:393-437` and `:546-550`.
- Rewrite `docs/planning/drift-dashboard.md` with no invented figures.
- Set the measured state in `artifacts/metrics/ai-metrics.json` to null/NEEDS_HUMAN, after checking its schema and generator.
- Never cite `drift-detection-config.yaml` (Terraform) or `optimization-loop.yaml` (DORA).
- Add ADR-088.

### D-10. Issues to file
- Outcome-based ROI.
- Per-tenant drift via the DB tier.
- Unwrapped chains and agents.
- Health-server /metrics is unauthenticated, plus an error leak.
- Deprecate the GBP `intelliflow.ai.inference.cost`.
- Unbounded `hallucinationChecker.results`.
- (Owner) Reword the CSV DoD.

## Round 3: CHALLENGE (condensed) and resolutions (REVISED DESIGN, R-items supersede the D-items they cite)

Initial sign-off positions:
- Security-Lead did not sign off D-1 or D-4 until C1, C2, E2 and E4 are fixed. D-5 and D-7 are acceptable once I2, I3 and D1 are addressed.
- Domain-Expert asked for changes to D-3d, D-8, D-6 and D-9.
- AI-Specialist, DevOps-Lead and Test-Engineer each found defects with file:line evidence.

All of them are resolved below. Full outputs are in the session transcript.

### R-1. Drift statistics (supersedes D-3c and D-3d)

Sources: AI C1-C5, C7-C9 and Domain C2.

**Metrics in scope.** Only `score_distribution` and `confidence_level` are in scope. Both are bounded 0..1 (`validators/src/lead.ts:118-119`). `user_satisfaction` and `user_correction_error` have no production producer (`drift-detector.ts:146-178`). The scheduler skips them, and the decile path is not built.

**Binning.**
- Fixed 10 equal-width bins on [0,1].
- Additive smoothing of +0.5 per bin replaces `epsilon=1e-4` (`:453`).
- **Excess PSI** = PSI − (B−1)(1/n+1/m) removes the null bias. Raw PSI is about 0.54 under no drift at n=25 and m=50.
- The gate and the bands use excess PSI.

**KS test.**
- Two-sample asymptotic test, with the ECDF evaluated only at distinct values, which handles ties.
- Uses the real n and m (`n_eff`) and the full Kolmogorov series.
- It is documented as "asymptotic, conservative under ties", not as exact.

**Gate and bands.**
- detected_tick = p < 0.01 AND (excessPSI ≥ 0.1 OR D ≥ 0.1). α is stricter because there are 48 ticks a day.
- severity = max(excessPSI band 0.1/0.2/0.25/0.5, D band 0.1/0.2/0.3/0.5).
- The composite score is used for display only.

**Persistence.**
- A drift *event* starts only when 3 consecutive evaluated ticks are detected_tick.
- `intelliflow.ai.drift.detections` increments ONCE per event onset. It does not increment per tick.
- The event ends after 3 consecutive ticks that are not detected.

**Baseline.**
- The baseline is a time-of-day-matched reference: the same 6h slice on each of the previous 1..7 days, pooled. This handles daily cycles and absorbs a regression only after 7 days, not about 30h.
- Sample retention rises from 48h to 8d (`:124-125`).
- Evaluation requires at least 50 reference samples and at least 25 current samples (`minSamplesRequired/2`, `:269`). Otherwise the status is `insufficient_data`.
- `setBaseline` stays as a manual pin.

**Honest limits.** These go into the ADR and the NEEDS_HUMAN notes.
- Samples are in-memory. Every deploy restarts warm-up, and at least one prior day's slice is needed, so warm-up is ≥24h.
- Each replica keeps its own samples.
- Detection needs at least 4.2 scored leads per hour.
- A follow-up issue covers hydrating samples from the DB tier.

**Naming.**
- The alert and dashboard text say "output distribution shift (lead mix or model)", not "model drift".
- Confidence-distribution drift is shown as the closer proxy for model change.

**Smaller fixes.**
- The scoring chain's score is normalised by /100 unconditionally. This fixes the `score>1` bug at `chain-monitor.ts:228`.
- Drift samples from the job-level fallback-provider chain (`scoring.job.ts:233-240`) are excluded. A new `MonitoringContext.recordDrift?: boolean` is set false on the fallback path, because mixing providers under one key looks like drift.
- `modelVersion` is labelled from the chain's actual provider instead of `aiConfig.provider` (`scoring.chain.ts:212`).

**D-3e is kept:**
- structured `{model,metric}` keys
- `DriftResult.model`
- the flush fix at `monitoring-flush.service.ts:84`
- `driftHistory` capped at 7d
- `DriftResult.status`

### R-2. Recording semantics (supersedes parts of D-1 and D-2)

Sources: AI E1-E6, Security C1, C2, C5, E3, E5 and Test.

**Model labels.**
- Model inputs are normalised through `servedPricingKey` (`ai.config.ts:313-317`) and then checked with `Object.hasOwn(MODEL_PRICING, key)`.
- `default`, `unknown`, `undefined` and `:free` names map to `other`.
- All attribute values (metric, severity, status, urgency, value_type, hallucination_type, reason) are checked at runtime with `Object.hasOwn` on const arrays, not only through TypeScript types.

**Cost.**
- `computeTokenCost` returns `number | null`. Null means no usage was captured.
- Cost is recorded on OTel only when usage is present AND the model key is known. 0 is a legitimate value.
- Unknown keys get no OTel cost, because `calculateCost` would invent gpt-3.5 pricing for them (`:324-331`). The ROI tracker keeps its existing behaviour.

**Confidence.** It is recorded only from the result's raw `confidence` field, and only when that value is finite and within [0,1]. The default `1` at `chain-monitor.ts:263-266` is never recorded.

**Error classification.** `error_class` comes from a pure classifier that returns one of `timeout|rate_limited|parse|other`. It never passes through `error.name` or `error.message`.

**Errors outside `withMonitoring`.** Errors raised inside `scoreLead` before `withMonitoring` (tenant tier, LLM creation, prompt) are counted in the outer catch with `outcome=error, error_class=other`. A per-call "already counted" flag prevents counting the same error twice.

**Known double count.** A timeout race (`scoring.job.ts:154,219-223`) can record two inferences for one job. This is rare and documented on the dashboard.

**Value booking.**
- Value is booked only when `valueType` is passed, with a debug log when it is absent.
- In-app ROI is unchanged in production. The only real caller is scoring, and the ROI rows are tenant-null and already invisible to tenants (`AIMonitoringService.ts:379-381`). The PR says so.

**Auto-response.** `auto_response` gets the `chain` label only. It has no production call site (`auto-response.chain.ts:245-249`), so its coverage is structural. The PR and the dashboard must not imply that auto-response is monitored.

**Counter pre-seeding.** At registration, counters are pre-seeded with `add(0, attrs)` for the small closed label sets (model × chain). Ratios and `increase()` then have a zero point instead of no data.

**Observable gauges.**
- Gauges are registered at worker boot.
- Callbacks are synchronous, read a snapshot cached at each tick, and run inside try/catch.
- `drift.last_check` is observed only once the first tick has happened.
- Series are bounded: model allowlist (~30) × 2 metrics. A test asserts the bound.

**Scheduler logs.** Only these fields are logged: counts, status, severity, model (allowlisted), metric, pValue, score, durationMs. Never the result object, distributions, recommendations or samples. A captured-logger test asserts that no seeded sample value appears in the logs.

**Scheduler start.** It starts FIRST in `onStart`, right after `loadAIConfig`, in its own try/catch, so earlier steps that throw cannot skip it (`ai-worker.ts:182-221`). It stops in `onStop` before the flush. `AI_WORKER_MODE=library` (`index.ts:507-515`) is stated as out of scope.

**Guard against a second meter provider.** A test or static check fails if any non-test file in ai-worker imports `initMetrics` (AI I1).

**`@opentelemetry/sdk-metrics`** is a devDependency pinned to `2.8.0`, the version `sdk-node@0.219.0` resolves. It is not `^2.8.0`, because that could resolve 2.11.0.

### R-3. Alert rules and workflow (supersedes parts of D-5)

Sources: DevOps C1-C8, Security I1-I3.

**Selectors and gates.**
- Resource selector: `job=~"(.*/)?(intelliflow-)?ai-worker"`. The namespace may be absent; see `infra/terraform/modules/monitoring/main.tf:16-21`.
- Span gate: `service=~"(intelliflow-)?ai-worker", span_name=~"llm.*"`. Gating on LLM spans means health-probe spans do not keep "silent" firing forever (`llm-tracer.ts:77,194,233`).

**Rule expressions.**
- Absence rules use `(… or vector(0))`.
- Ratio numerators use `or vector(0)`, and denominators use `clamp_min`.
- The latency rule needs at least 10 calls in 10m. The 2000ms threshold is re-checked after the first measured week.
- The drift rule counts event onsets: `increase(intelliflow_ai_drift_detections_total{severity=~"high|critical"}[1d]) > 0`.
- The stalled rule checks `last_check` age with `for: 30m`.

**Dry run.** The sibling script's `--dry-run` also instant-queries every rule `expr` and fails on an HTTP error or `status != success`. This matters because `execErrState: 'Error'` (`grafana-provisioning.mjs:58`) would otherwise page on a PromQL typo.

**Validation.**
- Rule uids must carry the `ifc117-` prefix, because Grafana rule uids are org-wide.
- The folder `intelliflow-ai` and the group `intelliflow-ai` must differ from IFC-032's.
- `datasourceUid`, folder and group are checked against `SAFE_PATH_SEGMENT`.
- A test asserts that `SAFE_PATH_SEGMENT.source` matches the original's exported regex, which detects drift between the copies.
- Every Grafana response text is truncated and redacted, including folder-create failures.
- A follow-up issue moves the shared validation into the lib after ENV-008-AI merges.

**New files.**
- `tools/scripts/observability/apply-grafana-ai-alert-rules.d.mts`, following the precedent `apply-grafana-alert-rules.d.mts`.
- A workflow-YAML test asserting:
  - no `pull_request` or `pull_request_target` trigger
  - `permissions: contents: read`
  - `environment: Production`
  - the token appears only under `env:`
  - the paths filter and the sparse checkout are correct

**Pinned versions.** `actions/checkout@v7`, `setup-node@v7`, node 24, matching `grafana-alert-rules.yml:45-53`.

**NEEDS_HUMAN.**
- "Preview routing" for the label set `{severity, team:owner, source:ifc-117, grafana_folder:intelliflow-ai}`.
- The promotion follow-up turns `requireSeries:true` back on, at least for the heartbeat rule.

### R-4. Dashboard (supersedes D-6)

Source: DevOps 4a.

- ENV-008-AI's planned dashboard job applies ONE fixed file (`dashboard-production.json`, uid `env008-production`).
- Its validator only accepts span metrics and the `api|ai-worker` service (`env-008-ai/.../ENV-008-AI-plan.md:293-300`), and it builds the POST wrapper itself.
- So the AI dashboard cannot ride that job as currently planned. The layout question is open with env-008-ai-c7.
- This PR commits `infra/monitoring/grafana/cloud/dashboard-ai-models.json` in whatever shape env-008-ai-c7 confirms. If there is no answer yet, it is a BARE dashboard model (no wrapper) in folder `intelliflow-prod`.
- Applying it is NEEDS_HUMAN, blocked on an ENV-008-AI follow-up that adds glob or multi-file support and an `intelliflow_ai_*` allowlist. That follow-up is filed as an issue. No second apply path is built, per the coordinator's ruling.

### R-5. Old files and the CSV row (supersedes the "Retire" part of D-6, and D-8 and D-9)

Sources: Domain C3-C4, DevOps 4b-4c, Security E2.

**`prometheus-exporter.ts`.** It is deleted per coordinator answer 6. Its CSV `ARTIFACT:` entry is replaced, under a recorded Category B rebaseline:
- **Old → new:** the exporter entry becomes the OTel facade `apps/ai-worker/src/monitoring/otel-ai-metrics.ts`. The dead `infra/monitoring/ai-grafana-dashboard.json` and `infra/monitoring/ai-prometheus-rules.yaml` entries become `infra/monitoring/grafana/cloud/dashboard-ai-models.json` and `infra/monitoring/grafana/cloud/ai-alert-rules.json`.
- **Why it is in-envelope:** the outcome is preserved (metrics, dashboards, alerts), and no acceptance criterion is removed.
- **How it is applied:** the edit goes in the canonical `Sprint_plan.csv` only. The splits are regenerated, plan validation runs, and the change is logged in `docs/planning/plan-change-log.md`. It gets independent review in the PR.

**The old dashboard, the old rules and `alerts-config.yaml` stay on disk, UNTOUCHED.** Nothing is edited, so other tasks' attestation hashes are not broken:
- TRACK-004 (`Sprint_plan.csv:340` `FILE:`; sprint-14 attestation hash)
- IFC-055 and IFC-142 (they reference `alerts-config.yaml`)

`docs/planning/drift-dashboard.md` and ADR-088 name the new files as canonical and the old ones as superseded. An issue is filed to retire the old files together with the TRACK-004 owner.

**`ai-metrics.json`.**
- Its `kpis.*` keys stay, because the TRACK-004 route reads them (`apps/project-tracker/app/api/tracking/ai/route.ts:6,59-70`).
- The measured fields (`current_*`, `status`, `current_hours`) are set to null/NEEDS_HUMAN, but only after the route and `AIMetrics.tsx` are confirmed to tolerate null. If they do not, a minimal tolerant change is made there.
- The dangling `$schema` is left alone.
- The sprint-6 hash mismatch is expected (that attestation is history).

**CSV status.**
- After the PR, the status is `Needs Human`. That is a legal transition from `In Progress` (`workflow/config.ts:64`).
- The plan first checks that the CSV validator, `split-sprint-plan` and `csv-status-guard.mjs` accept that value. If they do not, the status stays `In Progress` with the reason recorded.
- The `EVIDENCE:` field gains the sprint-18 attestation path (Category A).
- The DoD text is not edited.

**N1–N7.** Each becomes "who / command or query / pass threshold" in the attestation:
- N3 is a dependency on ENV-008-AI.
- N2 is labelled "detected by the heuristic checker". It is a floor, not ground truth.
- N1 is either a natural shift or a seeded replay run by the owner. A real production shift cannot be forced.

### R-6. Tests (supersedes parts of D-7)

Sources: Test C-1 to C-26, Security D1.

**Real-chain test.**
- Setup in `beforeEach`, never `beforeAll`, because `unstubGlobals`, `resetMocks` and `restoreMocks` are set in `vitest.config.ts:49-53`:
  - `__resetFactoryCache()`
  - stub global fetch (the mock branch has no fetch injection, `llm-factory.ts:438-447`)
  - set `AI_PROVIDER` with `vi.stubEnv`, then `vi.resetModules()` and a dynamic import
  - mock the cost tracker (`llm-tracer.ts:60-75`)
  - give each test a fresh `createChainMonitor()` through `vi.spyOn(chainMonitor,'getConfig')`
- The fake response is a `chat.completion` whose `message.content` holds the JSON schema object. The structured-output method is `jsonSchema` for `scoring-free` (`@langchain/openai base.js:472-476`).
- Assert `response_format.type === 'json_schema'` in the request.
- Usage uses standard OpenAI field names. The expected cost is a literal computed independently from `MODEL_PRICING['scoring-free']`.
- Factors carry reasoning of at least 10 characters, so the hallucination checker runs rather than skipping.
- Guards: `score > 0`, `modelVersion !== 'error:v1'`, fetch called exactly once.

**Metrics harness.**
- A `MetricReader` subclass with DELTA temporality and no timers.
- `expect(metrics.setGlobalMeterProvider(p)).toBe(true)` after `metrics.disable()`.
- A facade seam, `__setMeterForTests`. `__resetAiMetricsForTests` also unregisters the gauge callbacks.
- One collect per scenario.
- `afterAll` awaits `provider.shutdown()` and then calls `metrics.disable()`.
- If the global-provider test cannot run in the normal suite in CI, decide in the plan. The default is the seam plus one small global-wiring test.

**Static cross-check.**
- A hard-coded table of golden OTel-to-Prometheus name pairs, marked as an ASSUMPTION. The registered names are DERIVED by running every recorder against the in-memory reader.
- A PromQL tokenizer, with `names.length > 0` checked per expression.
- A label-allowlist check.
- Negative control: fixture copies of the old dead files under `__tests__/fixtures`, which must FAIL the check.
- It cannot prove the live Grafana names; that remains N5.

**Drift tests.**
- A seeded mulberry32 generator.
- `vi.useFakeTimers({toFake:['Date']})` with `setSystemTime`.
- Wide margins: a shift of at least 2σ with n ≥ 200, and no-shift p > 0.2.
- One hand-computable exact KS-statistic case, and a KS-with-ties case.
- A false-positive-rate test over 200 seeded null windows.
- Boundary tests for every gate combination and band edge.
- A PSI null-calibration test at n=25 and m=50: excess PSI must stay below the gate.
- Persistence and event-onset counting.
- Time-of-day reference windows.

**Scheduler tests.**
- `afterEach(vi.useRealTimers)` and `vi.advanceTimersByTimeAsync`.
- Re-entrancy is tested with a pending promise.
- `stop()` leaves `vi.getTimerCount() === 0`.
- The scheduler starts even if a later step in `onStart` throws.

**Existing tests to update.**
- `chain-monitor.test.ts:350-366` (value booked without context): rewrite.
- Check `chain-monitor.metrics-fidelity.test.ts` and `monitoring/__tests__/index.test.ts:95,145-154`.
- Delete `getAllMetrics` and the text builders in the SAME commit as their tests: `index.test.ts`, `drift-detector.additional.test.ts:841-883`, `latency-monitor.additional.test.ts:752-799`, `roi-tracker.test.ts:1106-1155`.
- Grep by import path, not by name, because `packages/platform` has its own `getAllMetrics`.
- Delete `scoring-with-monitoring.integration.test.ts` (fake-green).
- Fix `drift-detector.test.ts:262-290`.

**Coverage and clean exit.**
- New tools-script lines count toward diff-coverage (`vitest.config.ts:228-229,308`), so keep the `main` guard minimal.
- Confirm the touched files are not in the coverage-exclusion list (`vitest.config.ts:377-404`).
- Verify a clean exit with `COVERAGE_RUN=1` as an explicit plan step, with the command.

**Test data hygiene.**
- Canaries are plain words built at runtime, such as `'CANARY_' + 'MARKER_' + 'a'.repeat(8)`.
- No `password`, `token` or `secret` keys with literal values; no `sk-`, `eyJ`, `ghp_` or `Bearer` literals; no cuid-shaped ids.
- Hosts use `*.example.invalid`.
- `.gitleaks/scan.sh staged` runs before every commit.

### R-7. Issues to file (D-10 plus additions)

- Outcome-based ROI (owner).
- Per-tenant drift via the DB tier. Note that global drift is visible to all tenants (`AIMonitoringService.ts:59-60`), and that ROI/cost rows are tenant-null.
- Unwrapped chains and agents, including auto-response having no call site.
- Health-server `/metrics` is unauthenticated, and its 500 path leaks `error.message`.
- Deprecate the GBP `intelliflow.ai.inference.cost`.
- Unbounded `hallucinationChecker.results`.
- Hydrate drift samples from the DB at boot (deploy warm-up).
- ENV-008-AI dashboard job: multi-file support and an `intelliflow_ai_*` allowlist.
- Extract the shared Grafana validation into the lib.
- Retire the old `ai-grafana-dashboard.json`, `ai-prometheus-rules.yaml` and `alerts-config.yaml` with the TRACK-004, IFC-055 and IFC-142 owners.
- (Owner) Reword the CSV DoD wording on 5%.
- `context-hydration.ts:308` returns 0 patterns on Windows.

## Round 4: CONSENSUS (via /spec-consensus)

The same five agents that ran Round 3 voted on R-1 to R-7. Consensus was reached in the first consensus round.

| Agent | Vote | Non-blocking modifications |
| --- | --- | --- |
| ai-specialist | APPROVED | Warm-up is about 2 days at the minimum rate. Prune amortised. Cap samples per key. `last_check` advances on `insufficient_data`. |
| devops-lead | APPROVED | Pre-seed drift detections for the rule's label set. Aggregate the stalled rule with `max()`. Pre-check the CSV status, with a fallback. Pre-seed count goes in the cardinality test. |
| security-lead | APPROVED | Per-key cap with 8d retention. Global drift is model-level only (ADR). Null-tolerance is an explicit step. Name a promotion owner and date. |
| domain-expert | APPROVED | Weekday/weekend note in the ADR. Null check covers `current_hours` and `status`, and UI NaN. AC: no drift sample on the error path. Dashboard is not "delivered" in the CSV until N3. |
| test-engineer | APPROVED | Assert the API alias reaches the provider. Budget a full-suite pre-ship. Per-key cap test. `Promise.all` concurrency test. Decide upfront where the global-wiring test lives. |

Approval rate: 5/5 (1.0), against a threshold of 0.66. RESULT: APPROVED.

All non-blocking modifications are folded into `IFC-117-spec.md`. The recorded votes are in `IFC-117-spec-consensus.json`.
