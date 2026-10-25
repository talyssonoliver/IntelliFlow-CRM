# IFC-117 Delivery Report — AI model monitoring (sprint 18)

- **Run:** `run-20261025-exec` (exec started 2026-10-25T16:19:27Z)
- **Branch:** `feat/IFC-117-ai-model-monitoring` (worktree `intelliFlow-CRM-worktrees/ifc-117`, from origin/main `d8bf93c40`)
- **Spec:** `.specify/sprints/sprint-18/specifications/IFC-117-spec.md` (consensus 5/5)
- **Plan:** `.specify/sprints/sprint-18/planning/IFC-117-plan.md` (plan-reviewer subagent: REVISE, REVISE, APPROVED_WITH_CHANGES)
- **ADR:** ADR-088, Accepted after the validation matrix passed
- **Verdict:** NEEDS_HUMAN. The code path is delivered and tested; the production KPIs (N1-N7) are the owner's after ai-worker is promoted.

## What changed

1. **OTel facade** (`apps/ai-worker/src/monitoring/otel-ai-metrics.ts`, types in `otel-ai-types.ts`): 14 instruments on the
   global meter that ai-worker's NodeSDK registers (OTLP to Grafana Cloud). Closed-set labels only, model normalised to
   pricing keys, every recorder fail-open, both gauge callbacks guarded.
2. **Call-site recording** (`chain-monitor.ts`, `scoring.chain.ts`, `auto-response.chain.ts`, `scoring.job.ts`): latency,
   outcome and error class, USD cost (known models only), estimated value (explicit `valueType` only), confidence,
   hallucination checks/detections/types/skips, drift samples (score/100 and confidence). The success and error paths
   both record; the scoring chain's outer catch records an error that happens before monitoring starts.
3. **Drift** (`drift-stats.ts`, `drift-detector.ts`, new `drift-scheduler.ts`): fixed 10 bins, excess PSI, tie-aware KS
   with real n/m, gate p<0.01 and (excess PSI ≥ 0.1 or D ≥ 0.1), 3-tick persistence with onset counted once,
   time-of-day reference (same 6h slice on days −1..−7), 8-day retention and a 50,000-sample cap. The scheduler is the
   first production caller of `detectAllDrift`: every 30 min, unref'd, re-entrancy guarded, started in
   `AIWorker.onStart` right after the config loads and stopped before the flush.
4. **Exporter deleted**: `apps/ai-worker/src/metrics/prometheus-exporter.ts` and its test, the text builders and
   `getAllMetrics`. It was never mounted, so it exported nothing; keeping it would have kept a second, fail-open,
   unauthenticated path. `scoring-with-monitoring.integration.test.ts` (a fake-green test that never reached the chain)
   is replaced by `scoring.chain.otel.integration.test.ts` (real ChatOpenAI, fake fetch).
5. **Grafana as code**: `infra/monitoring/grafana/cloud/ai-alert-rules.json` (6 rules, folder and group
   `intelliflow-ai`), applied only by `.github/workflows/grafana-ai-alert-rules.yml` through the sibling script
   `tools/scripts/observability/apply-grafana-ai-alert-rules.mjs` (reuses `tools/scripts/lib/grafana-provisioning.mjs`;
   dry run instant-queries every expression). `infra/monitoring/grafana/cloud/dashboard-ai-models.json` in the
   ENV-008-AI job shape (not applied until that job reads more than one file, N3).
6. **Truthful artifacts and docs**: `artifacts/metrics/ai-metrics.json` holds targets and config only (measured fields
   null); `docs/planning/drift-dashboard.md` rewritten; dependency-chain docs, MILESTONES and the feature matrix no
   longer call IFC-117 complete; CSV artifacts repointed (Category B, `docs/planning/plan-change-log.md`).

Untouched, as the coordinator required: `apply-grafana-alert-rules.mjs`, `grafana-alert-rules.yml`,
`intelliflow-rules.yaml`, the MTTD rule, the collector and spanmetrics config, and the sprint-6 attestations.

## TDD log

- **RED** (`tdd/red-ai-worker.txt`, `tdd/red-tools.txt`): every new test file failed for the expected reason (missing
  module or old behaviour): `otel-ai-metrics.test.ts`, `otel-ai-metrics.global.test.ts`, `chain-monitor.otel.test.ts`,
  `drift-detector.shift.test.ts`, `drift-scheduler.test.ts`, `scoring.chain.otel.integration.test.ts`,
  `feedback-analytics.job.test.ts`, `scoring.job.test.ts`, `monitoring-flush.service.test.ts`,
  `ai-worker.boot-folded-workers.test.ts`, `apply-grafana-ai-alert-rules.test.ts`, `ai-monitoring-assets.test.ts`.
- **GREEN**: commits `bcf1d8899` (ai-worker), `10f31019a` (rules, dashboard, workflow, ai-metrics.json).
- **REFACTOR**: the PromQL tokenizer became a character scanner shared by the script and its test (sonarjs/slow-regex);
  the fake Grafana handler was split (cognitive complexity).
- **Independent plan check**: a separate agent compared all 133 plan checkboxes with the code. It found 16 partly met.
  Commit `828b77e4f` closed 13 of them with new tests and one real fix (the last-check gauge callback was unguarded);
  the remaining 3 are recorded deviations (below).

### Old-formula drift assertions that changed (plan S12)

The old tests encoded the replaced statistics (mean-split baseline, fixed n=100 KS, 48h pruning, Prometheus text), so
both files were rewritten deterministically against the new definitions. `monitoring-flush.service.test.ts` only gained
a case.

- `drift-detector.test.ts`: removed 13 cases (`should group samples by model:metric key`, `should prune old samples
  automatically`, `should return null with insufficient samples`, `should compute baseline with sufficient samples`,
  `should return no drift with insufficient data`, `should detect no drift with stable distribution`, `should detect
  drift with shifted distribution`, `should track last check time`, `should return drift history sorted by timestamp`,
  `should manually set baseline window`, `should have appropriate window size`, `should have severity thresholds`,
  `should use standard p-value threshold`); added 14 (grouping by structured key, retention pruned on the scheduled
  tick, insufficient reference samples, the time-of-day reference window, insufficient data never reported as healthy,
  stable and shifted distributions, last scheduled check, evaluated results newest first, insufficient-data results not
  recorded, pinned baseline, window size and interval, the strict p-value (48 ticks a day), 8-day retention for a 7-day
  reference).
- `drift-detector.additional.test.ts`: removed 26 cases (48h pruning, oldest-half baseline, the default-result and
  baseline branches, history on detection, the latency/error_rate and per-severity recommendation texts, all-results,
  high-severity count, history sorting and limits, distribution bins, the pValue extremes, severity classes, and the
  four Prometheus-text cases that went with `getDriftMetrics`); added 14 (":" in a model version, samples outside the
  reference slices ignored, the insufficient-data default, small current window, pinned baseline with too few samples,
  pinned baseline used, evaluated results in history, latency and error_rate recommendations, critical recommendations
  for a complete shift, none when nothing is detected, all tracked combinations, high and critical detections in the
  last 24h, binning on the shared ten edges). The statistics themselves are covered in `drift-detector.shift.test.ts`.
- `monitoring-flush.service.test.ts`: added `flushNow() writes the drift result model, not the metric name, into model`.

## Acceptance criteria

| AC | Evidence |
| --- | --- |
| AC-001 | `scoring.chain.otel.integration.test.ts` — real chain records latency, count, cost 0.00014, value 0.5, confidence and one hallucination check with exact attributes |
| AC-002 | same file, error case (HTTP 400): `outcome=error`, classified `error_class`, no value, no check, no drift sample; pre-monitoring error counted once |
| AC-003 | `otel-ai-metrics.test.ts` "counts hallucination checks, detections and types consistently"; `chain-monitor.otel.test.ts` |
| AC-004 | `chain-monitor.otel.test.ts` — direct `checkOutput` calls leave the call-site counters unchanged |
| AC-005 | `drift-detector.shift.test.ts` — shift, no-shift control, exact KS, ties, real n, null PSI calibration, false-positive bound, gate and band boundaries, persistence, reference windows, retention |
| AC-006 | `drift-scheduler.test.ts`; `ai-worker.boot-folded-workers.test.ts` (onStart ordering and start despite a later failure) |
| AC-007 | `drift-detector.test.ts` / `.additional.test.ts` insufficient-data cases |
| AC-008 | `otel-ai-metrics.test.ts` cost and value semantics; `chain-monitor.otel.test.ts` score/100 |
| AC-009 | `otel-ai-metrics.test.ts` allowlist, canary, cardinality (every attribute position within the seeded bound) |
| AC-010 | `otel-ai-metrics.global.test.ts` — global provider path; no non-test file uses `initMetrics` |
| AC-011 | `git grep -n "prometheus-exporter\|default-dev-token\|METRICS_TOKEN" -- apps packages` returns nothing; `feedback-analytics.job.test.ts` uses `recordRetrainingTrigger` |
| AC-012 | `apply-grafana-ai-alert-rules.test.ts` (36 tests: validation, pinned uids, own folder/group, thresholds from `AI_ALERT_THRESHOLDS`, dry run executes every expr, token hygiene, workflow contract) |
| AC-013 | `ai-monitoring-assets.test.ts` — golden names; the legacy dashboard and rules fail the same check |
| AC-014 | docs commits `2d6218ad4`, `10f31019a`; `ai-api.test.ts` + `AIMetrics.test.ts` pass with the nulls |
| AC-015 | `.specify/sprints/sprint-18/attestations/IFC-117/attestation.json`, verdict NEEDS_HUMAN with N1-N7 |

## Validation (all run in this session; logs in `validation/`)

| Check | Command | Result |
| --- | --- | --- |
| ai-worker full | `pnpm --filter @intelliflow/ai-worker test` | exit 0, 2490 passed, 10 skipped (37 s, after `828b77e4f`) |
| New ai-worker tests | matrix row 1 | exit 0, 131 passed |
| Touched ai-worker suites | matrix row 2 | exit 0, 1235 passed, 8 skipped (before `828b77e4f`; the full run above supersedes it) |
| Clean exit (NF-005) | `COVERAGE_RUN=1 … vitest run src/monitoring src/chains src/jobs` | exit 0, 1030 passed, 0 "Unhandled" lines |
| New tools tests | `npx vitest run --project root …apply-grafana-ai-alert-rules… …ai-monitoring-assets…` | exit 0, 43 passed |
| IFC-032 script untouched | `…apply-grafana-alert-rules.test.ts tools/scripts/lib/grafana-provisioning.test.ts` | exit 0, 22 passed |
| Project-tracker consumer | `…ai-api.test.ts …AIMetrics.test.ts` | exit 0, 63 passed |
| TypeScript | `pnpm run typecheck` (slot) | exit 0 (131 s); ai-worker typecheck re-run after `828b77e4f`: exit 0 |
| Lint | `pnpm run lint` (slot) | exit 0 (46 s) |
| Build | `pnpm run build` (slot) | exit 0, 20/20 tasks (352 s) |
| Workflow secrets | `node tools/scripts/security/workflow-secret-lint.mjs` | exit 0 (40 workflow files) |
| Secret scan | `bash .gitleaks/scan.sh staged` before every commit | exit 0 each time |
| Docs | `pnpm validate:docs-integrity` | exit 0 |
| Sprint data | `pnpm validate:sprint-data` | exit 0 (with IFC-117 In Progress; see deviations) |
| Phantom audit | `node tools/scripts/audit/phantom-completed-audit.mjs` | IFC-117 not flagged |
| Preflights | readiness, plan-reviewer, page-doc, nav-wiring, lighthouse, task-json schemas | exit 0 each |
| Gate 4b | `check-worktree-landed.mjs IFC-117 18` | BLOCK — see below |
| Pre-ship | the single slot-wrapped push | runs at push time, not before this report |

### Coverage (`artifacts/coverage/IFC-117-before.json` → `-after.json`)

Lines 97.51 → 98.20, branches 85.00 → 88.49, functions 93.80 → 95.18, statements 96.61 → 97.27. New modules:
`otel-ai-metrics.ts` 99.24 lines, `drift-stats.ts` 100, `otel-ai-types.ts` 100, `drift-scheduler.ts` 100 (after the
default-logger test). `chain-monitor.ts` branches 90.24, `drift-detector.ts` branches 94.84.

### Gate 4b (worktree landed) — BLOCK, disclosed

At attestation time it blocks for three reasons, all expected: (1) the branch is not pushed yet (the coordinator allows
one push, after this report); (2) the branch name `feat/IFC-117-ai-model-monitoring` was set by the coordinator and does
not match `agent/<TASK_ID>`; (3) uncommitted files: the plan's ticked checkboxes (committed with the attestation) and
generated reports a validator rewrote (`artifacts/reports/spec-tracker.json`,
`artifacts/reports/phantom-completed-audit.json`, `docs/audit/phantom-completed-2026-10-25.md`), which are out of scope
and go to the coordinator for a restore. IFC-033 (#1013) used the same disclosure.

## Deviations from the plan

- `otel-test-reader.ts` is an extra test helper (shared in-memory reader).
- `drift-stats.ts` and `otel-ai-types.ts` are not in the spec's Components table; added for NF-006 (statistics free of
  OTel imports) and to avoid an import cycle.
- The `AIWorker.onStart` ordering test lives in `src/__tests__/ai-worker.boot-folded-workers.test.ts` (it already has
  the AIWorker harness), not in `drift-scheduler.test.ts`; the S10 step order changed accordingly.
- The stalled and silent alert rules are gated on the AI series existing instead of the `or vector(0)` absence
  default, so they cannot fire before ai-worker is promoted.
- The integration test's error case uses HTTP 400, not 500: ChatOpenAI retries 5xx, which breaks the one-fetch
  assertion. HTTP 500 is covered on the Grafana dry-run side.
- The "no value without `valueType`" debug log exists (`chain-monitor.ts:321`) but is not asserted.
- The CSV row stays **In Progress** (50% → 90%) instead of Needs Human: `tools/scripts/validate-sprint-data.ts:53`
  does not accept the canonical `Needs Human` status (`apps/project-tracker/lib/types.ts:33`). Follow-up issue filed.
- The CSV splits D–J all changed: the splitter balances by size, so the longer IFC-117 row moved one row across each
  later boundary. They reassemble the canonical CSV exactly (622 rows).
- The feature-matrix edit re-pads the whole table (prettier widens the status column for `in_progress`).
- `validate-artifacts.ts IFC-117` is expected to exit 1 with a fixed set (plan S25); its output is in
  `validation/validate-artifacts.txt` and compared below.

## Follow-ups (filed at PR time, after an `gh issue list --search` check)

1. health-server `/metrics` unauthenticated and `error.message` in 500 bodies
2. chains and agents that bypass `withMonitoring` (auto-response has no production call site)
3. per-tenant drift and tenant-attributed cost/ROI
4. outcome-based ROI (owner)
5. the GBP `intelliflow.ai.inference.cost` and duplicate AI instrument names in `packages/observability`
6. unbounded `hallucinationChecker.results` (`pruneResults` has no caller)
7. hydrate drift samples from the DB at boot
8. ENV-008-AI dashboard job: several files and an `intelliflow_ai_*` allowlist
9. move the shared Grafana validation into the lib
10. retire the superseded AI dashboard, rules and alerts files
11. DoD wording "targets: >=5%" (owner)
12. `context-hydration` returns 0 patterns on Windows — already #881, linked instead of re-filed
13. switch to ENV-008-AI's `redactBody` and retry once merged
14. `validate-sprint-data` rejects the canonical Needs Human status

## NEEDS_HUMAN (owner, after promotion)

N1-N7 as in the spec's Acceptance Criteria table and the attestation: drift onset within 24h, hallucination rate < 5%
with ≥ 200 checks, dashboard applied, rules applied and routed, metric names verified by a dry run after a scoring
call, cost and estimated value non-zero over 7 days, latency series present. No unit test is cited as proof of a KPI.

## validate-artifacts result (plan S25) — exit 1, compared with the expected set

Full output: `validation/validate-artifacts.txt` (STATUS: MISMATCH, as the plan expects).

- **Plan-only:** exactly the expected kind — the new tests and fixtures, `otel-ai-types.ts`, `drift-stats.ts`,
  `drift-scheduler.ts`, and modified files the CSV does not name (`apps/ai-worker/package.json`, `pnpm-lock.yaml`,
  `drift-detector.ts`, `chain-monitor.ts`, `scoring.chain.ts`, `ai-worker.ts`, `feedback-analytics.job.ts`,
  `monitoring/index.ts`, `drift-detector.test.ts`, `ai-intelligence-dependency-chain.md`, `Sprint_plan.csv`, ADR-088).
- **CSV-only, expected:** `infra/monitoring/alerts-config.yaml`, `.specify/sprints/sprint-6/attestations/IFC-117/attestation.json`.
- **CSV-only, not in the plan's expected set (3):**
  - `apps/ai-worker/src/monitoring/otel-ai-metrics.ts` and `docs/planning/drift-dashboard.md`: both are in plan steps
    S11 and S24, but `parsePlanArtifacts` (`tools/scripts/validate-artifacts.ts:200`) reads only contiguous single-line
    `` - `path` `` bullets; each of these follows a wrapped multi-line bullet, so the parser stops before it. The plan's
    claim that `drift-dashboard.md` would read as "Both" was wrong for the same reason.
  - `.specify/sprints/sprint-18/attestations/IFC-117/attestation.json`: the new EVIDENCE entry; the plan's expected set
    omitted it (it is not a plan file).

  None is a missing deliverable: all three exist on disk and are tracked in the CSV. The approved plan is not rewritten
  to satisfy the parser; the parser limitation is noted here.
- **Missing on disk:** none.
