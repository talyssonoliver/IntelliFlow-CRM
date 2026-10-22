# Execution Plan: IFC-074 — PHASE-040: Full Stack Observability

**Spec:** `.specify/sprints/sprint-18/specifications/IFC-074-spec.md` (5/5 APPROVED, 2026-10-22)
**Owner ruling:** `.specify/sprints/sprint-18/context/IFC-074/IFC-074-owner-ruling.md` (option A)
**Branch:** `feat/ifc-074-ifc074` · **Sprint:** 18 · **Ceremony tier:** full

## Related Documents

| Type | Path | Plan action |
|------|------|-------------|
| PRD | N/A | Backend/infra remediation, no user-facing feature (spec Related Documents) |
| ADR | `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md` | Exists (Proposed). Step 17 sets it to Accepted after validation |
| ADR | `docs/architecture/adr/ADR-001-modern-stack.md` | Referenced; amended by ADR-086 (no edit) |
| ADR | `docs/architecture/adr/ADR-017-workflow-reliability.md` | Referenced (real-trace rule enforced by collector exit 2) |

## Preflight Checks

1. Node 22: `export PATH="/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH"; node -v` prints `v22.14.0` (host default
   v25 hangs pg writes).
2. `export NODE_OPTIONS=--max-old-space-size=8192`; RAM ≥ 6 GB free, disk ≥ 8 GB free before any test/build.
3. Packages built: `ls packages/observability/dist/index.js packages/db/dist` (rebuild with
   `pnpm --filter @intelliflow/observability build` after Step 7).
4. Test DB healthy: `docker ps --filter name=postgres-test` → healthy (api suite).
5. Baseline green before changes (through the slot wrapper):
   `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 -- pnpm --filter @intelliflow/observability test`.
6. Grafana reachable read-only (lead verified 2026-10-22): `GRAFANA_URL`, `GRAFANA_SA_TOKEN` exported in the shell only
   for Step 12, unset afterwards.
7. ADR-086 number still free: `ls docs/architecture/adr/ADR-086*` = this file only; sibling worktrees hold 083–085.

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---------|---------------------|-------------------|----------------------|
| `getApiLogger()` (`apps/api/src/tracing/logger.ts`) | `tracingMiddleware` (`apps/api/src/tracing/middleware.ts`), used by every procedure builder in `apps/api/src/trpc.ts` | `console.log` trpc.request, `console.warn` SLOW REQUEST, `console.error` trpc.error in `middleware.ts` | `pnpm --dir apps/api exec vitest run src/tracing/middleware.test.ts src/tracing/logger.test.ts src/__tests__/trpc.test.ts` + `grep -n "console\.\(log\|warn\|error\)" apps/api/src/tracing/middleware.ts` shows only `metricsMiddleware` lines |
| `createLogger` `redact` | `getApiLogger()` | — | `pnpm --dir packages/observability exec vitest run src/logging.test.ts` |
| Pino → OTLP export | instrumentation-pino registered by `apps/api/src/tracing/otel.ts` via `@intelliflow/observability/node-instrumentations` | — | `pnpm --dir packages/observability exec vitest run src/pino-otlp.test.ts` |
| New `grafana-provisioning.mjs` read helpers | `collect-observability-evidence.mjs` | — | `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts` |
| `collect-observability-evidence.mjs run()` | Operator/agent locally (Step 12 now; post-deploy re-run for AC-002) | Hand-written `artifacts/reports/correlation-test.csv`, simulated `artifacts/reports/mttr-baseline.json` | `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts` + Step 12 run |

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| Setup + Tests (RED) | 10 file(s) (Steps 1-7: package.json, lockfile, 8 test/setup files) — 120-180 minutes |
| Implementation (GREEN) | 8 file(s) (Steps 8-12: logging.ts, logger.ts, middleware.ts, grafana-provisioning.mjs, collector .mjs + .d.mts, 2 regenerated evidence files) — 150-240 minutes |
| Truthful artifacts, docs, tracking | 10 file(s) (Steps 13-17: sentry config, 4 docs, findings doc, debt-ledger, task-tracking, ADR-086, ADR README) — 60-120 minutes |
| Validation + closing | 3 file(s) (Steps 19-20: attestation, Sprint_plan.csv, Sprint_plan_B.csv) + execution logs — 60-120 minutes |
| **Total** | **6.5-11 hours** (row PERT 90/180/360 → 195 min is superseded by the rebuild scope) |

## Execution Steps

### Phase 1: RED — Write Failing Tests

#### Step 1: Add exact-pinned OTel devDependencies for the OTLP interop test
**Type:** setup
**Files to Modify:**
- `packages/observability/package.json`
- `pnpm-lock.yaml`

Add devDependencies `"@opentelemetry/instrumentation-pino": "0.68.0"` and `"@opentelemetry/sdk-logs": "0.219.0"` (versions
already resolved in the lockfile via auto-instrumentations-node 0.80.0 / sdk-node 0.219.0), then `pnpm install`.

**Validation:**
- [x] Under Node 22.14.0 (`node -v`), `pnpm install` exits 0
- [x] `git diff --stat pnpm-lock.yaml` is small and `git diff pnpm-lock.yaml | grep "^+" | grep -E "instrumentation-pino|sdk-logs"`
      shows only the two importer entries for packages/observability
- [x] `ls packages/observability/node_modules/@opentelemetry/instrumentation-pino packages/observability/node_modules/@opentelemetry/sdk-logs`

#### Step 2: Real-record + redact tests for `createLogger`
**Type:** test
**Files to Modify:**
- `packages/observability/src/logging.test.ts`

New `describe('createLogger (real records)')`: in-memory destination via `vi.spyOn(pino, 'destination')` returning a
`Writable` that collects lines; `vi.stubEnv('CI','1')`, `NODE_ENV=production` (no pino-pretty worker); real
`NodeTracerProvider` + `InMemorySpanExporter` span.
- [x] emitted record's `trace_id`/`span_id` equal `span.spanContext()` inside an active span
- [x] no `trace_id`/`span_id` outside a span
- [x] `it.each` over every redact path (top-level and nested: `email`, `{a:{email}}`, `userEmail`, `password`,
      `token`, `accessToken`, `refreshToken`, `apiKey`, `api_key`, `secret`, `authorization`, `cookie`,
      `req.headers.authorization`, `req.headers.cookie`) → `[REDACTED]`; a non-sensitive key is untouched

**Validation:**
- [x] `pnpm --dir packages/observability exec vitest run src/logging.test.ts` → redact cases FAIL (no `redact` yet)

#### Step 3: OTLP interop test (instrumentation-pino → log exporter)
**Type:** test
**Files to Create:**
- `packages/observability/src/pino-otlp.test.ts`

Register `PinoInstrumentation` (`disableLogSending:false`) with a `LoggerProvider` + `SimpleLogRecordProcessor` +
`InMemoryLogRecordExporter` (`@opentelemetry/sdk-logs`); then create a logger with `createLogger` (module imported
after registration) inside an active span.
- [x] exported log record's span context trace/span ids equal the active span's
- [x] record body/attributes carry `type` from the call
- [x] a logger created BEFORE registration exports nothing (documents why `getApiLogger` is lazy)

**Validation:**
- [x] `pnpm --dir packages/observability exec vitest run src/pino-otlp.test.ts` runs (passes once Step 1 deps exist —
      characterisation test for the existing pipeline; it guards Steps 8-9)

#### Step 4: `getApiLogger` unit tests
**Type:** test
**Files to Create:**
- `apps/api/src/tracing/logger.test.ts`

`vi.unmock('./logger')`; mock `@intelliflow/observability` `createLogger`.
- [x] importing the module does not call `createLogger`
- [x] first call creates exactly once; second call returns the same instance
- [x] name = `OTEL_SERVICE_NAME` when set; whitespace-only or unset → `'intelliflow-api'`
- [x] `resetApiLoggerForTests()` forces re-creation

**Validation:**
- [x] `pnpm --dir apps/api exec vitest run src/tracing/logger.test.ts` → FAIL (module missing)

#### Step 5: Middleware log-record tests + global test mock
**Type:** test
**Files to Modify:**
- `apps/api/src/test/setup.ts`
- `apps/api/src/tracing/middleware.test.ts`
- `apps/api/src/__tests__/trpc.test.ts`

`setup.ts`: `const apiLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
child: vi.fn() }))`; `vi.mock('../tracing/logger', () => ({ getApiLogger: () => apiLogger,
resetApiLoggerForTests: () => undefined }))`; add `getActiveSpan: () => undefined` to the global
`@opentelemetry/api` `trace` mock. `middleware.test.ts` (replace the console assertion at :128):
- [x] success → `info` with `{type:'trpc.request', correlationId, path, method, durationMs, status:'success'}`
- [x] slow (> 50 ms via `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime` inside `next`) → `warn`
      `{type:'trpc.slow', ..., targetMs:50}`
- [x] failure → `error` `{type:'trpc.error', ..., status:'error', code, errorName}` and the record has no `message`,
      `stack`, `cause`, `requestId`
- [x] `errorName` fallback → `'Error'` for `'x y<>'`, a name with a newline, a 62-char name
- [x] invalid path (`'a b'`) → `path:'invalid'`
- [x] records emitted before `span.end()` (call order)
- [x] `console.log` never called with `trpc.request`
`trpc.test.ts:189,206`: assert the logger spies (`trpc.request` info; `trpc.slow` warn) instead of console.

**Validation:**
- [x] `pnpm --dir apps/api exec vitest run src/tracing/middleware.test.ts src/__tests__/trpc.test.ts` → FAIL

#### Step 6: Grafana read-helper tests
**Type:** test
**Files to Modify:**
- `tools/scripts/lib/grafana-provisioning.test.ts`

Fake `fetchImpl` recording method/path/headers.
- [x] `lokiQueryRange`, `tempoSearch`, `tempoTrace`, `promInstantQuery`, `grafanaHealth` build the documented proxy
      paths (`/api/datasources/proxy/uid/<uid>/...`) with encoded params and return parsed JSON
- [x] the read client only ever issues GET (it exposes no method parameter, so a write cannot be expressed); every recorded request is GET (exec-time wording fix: there is nothing to misuse)
- [x] `withRetry`: retries 429/502/503/504 with 5/10/20/40/60 s via injected `sleep`; honours `Retry-After`; stops after
      5; non-retryable 4xx fails at once
- [x] errors are `HTTP <status> <endpoint-name>` only — a sentinel token and a sentinel body never appear

**Validation:**
- [x] `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts` → FAIL (helpers missing)

#### Step 7: Collector tests
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/collect-observability-evidence.test.ts`

Fake Grafana routed by datasource path; injected `now`, `sleep`, `writeFile`, `rename`, `unlink`, `log`; temp dir via
`mkdtempSync`. The test imports `run` from `../observability/collect-observability-evidence.mjs`; TypeScript resolves its
types from the sibling `.d.mts` (the `.d.mts` consumer, same pattern as `apply-grafana-alert-rules.test.ts`).
- [x] missing `GRAFANA_URL` / `GRAFANA_SA_TOKEN` → returns 1, nothing written
- [x] every request is GET
- [x] correlation PASS (trace found, span found, service match, metric series at `log_ts`); FAIL variants (trace
      missing, span missing, metric absent); service with no lines → one `NOT_OBSERVED` row, `passed=false`
- [x] Tempo trace id without leading zeros is left-padded to 32 hex
- [x] `--since` narrows the Loki window
- [x] MTTD: incident split at a 30-min gap (edge = exactly 30 min), `previous` Pending, exclusions (delivery test,
      `asserts_up`) listed with constant reasons, unanchored (no error span), negative MTTD → unanchored, zero anchored →
      `kpi.met === null`, KPI uses mean (case where mean ≥ 120 > median), `auto_resolve_s`, raw transition count
- [x] alert history fetched in 7-day slices across a 30-day window
- [x] each anchored incident records `first_error_trace_id` (32 hex), `first_error_span_name`, `first_error_service`,
      `trace_resolves` (Tempo `/api/traces/<id>` found → true; 404 → false) (AC-005)
- [x] `pending_s` set when a Pending start precedes the Alerting transition
- [x] error-span search narrows the window while 50 traces return; window bounded below by the previous incident's end
- [x] aggregates `n_transitions, n_incidents, n_anchored, n_unanchored, mean_s, median_s, p90_s, share_lt_120s`
- [x] `cause_if_not_met` is a collector constant when `met === false`
- [x] free labels (`asserts_*`, request context) never reach the output; alert title emitted only for rule uids
      committed in `infra/monitoring/grafana/cloud/alert-rules.json`, otherwise `alertname`
- [x] the collector's own retry schedule (503 ×n then 200) via injected `sleep`
- [x] 503 then 200 → succeeds; retries exhausted → returns 1, nothing written, temp files removed
- [x] exit 2 when ai-worker has zero PASS rows or zero anchored incidents (files written)
- [x] fail-closed allowlist: a hostname label, a UUID, an email, a raw log line, a quote+newline value each → returns 1,
      nothing written, temps removed
- [x] span names with a hostname / UUID / ≥ 8-hex run / ≥ 6-digit segment → `"redacted"`
- [x] free-text JSON fields come from constants only; no column/key contains key/token/auth/secret/api
- [x] sentinel token absent from every `log` call, thrown error message and written byte
- [x] `--dry-run` writes nothing; SHA-256 of each output printed on success
- [x] CSV fully quoted with the spec header

**Validation:**
- [x] `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts` → FAIL

> **Checkpoint (RED):** all new/changed tests fail for the right reason (missing implementation), except Step 3, a
> characterisation test of the existing instrumentation-pino pipeline that is expected to PASS once Step 1's
> devDependencies are installed (it guards Steps 8-10). Nothing else breaks.

### Phase 2: GREEN — Make Tests Pass

#### Step 8: `createLogger` redact
**Type:** implementation
**Files to Modify:**
- `packages/observability/src/logging.ts`

Add `redact: { paths: [...spec list], censor: '[REDACTED]' }` to the pino options in `createLogger`. No other change.

**Validation:**
- [x] `pnpm --dir packages/observability exec vitest run src/logging.test.ts src/pino-otlp.test.ts` → PASS
- [x] `pnpm --filter @intelliflow/observability build` (api consumes dist)

#### Step 9: api logger
**Type:** implementation
**Files to Create:**
- `apps/api/src/tracing/logger.ts`

Lazy singleton per spec Interfaces; imports `createLogger`/`Logger` type from `@intelliflow/observability`.

**Validation:**
- [x] `pnpm --dir apps/api exec vitest run src/tracing/logger.test.ts` → PASS

#### Step 10: Middleware wiring (replace console calls)
**Type:** implementation
**Files to Modify:**
- `apps/api/src/tracing/middleware.ts`

In `tracingMiddleware` only: success / slow / failure records via `getApiLogger()` before `span.end()`; add
`safePath()` and `safeErrorName()` helpers; remove the three console calls (no duplicates). `metricsMiddleware` untouched.

**Validation:**
- [x] `pnpm --dir apps/api exec vitest run src/tracing src/__tests__/trpc.test.ts` → PASS
- [x] `grep -n "console\." apps/api/src/tracing/middleware.ts` → only `metricsMiddleware` lines remain

#### Step 11: Grafana read helpers + collector
**Type:** implementation
**Files to Modify:**
- `tools/scripts/lib/grafana-provisioning.mjs`
**Files to Create:**
- `tools/scripts/observability/collect-observability-evidence.mjs`
- `tools/scripts/observability/collect-observability-evidence.d.mts`

Helpers and collector per spec Part 2; main guard ≤ 4 lines mirroring `apply-grafana-alert-rules.mjs`.

**Validation:**
- [x] `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` → PASS

#### Step 12: Produce the evidence from production (read-only)
**Type:** integration
**Files to Modify:**
- `artifacts/reports/correlation-test.csv`
- `artifacts/reports/mttr-baseline.json`

`GRAFANA_URL=<stack> GRAFANA_SA_TOKEN=<from .env.local, env only> node tools/scripts/observability/collect-observability-evidence.mjs`
then `unset GRAFANA_SA_TOKEN`. Record exit code, printed SHA-256s and run time in the execution log. Expected now:
ai-worker rows PASS, api row NOT_OBSERVED, MTTD measured (met true/false/null as measured).

**Validation:**
- [x] exit 0 (or 2 with the reason recorded — then stop and report, never hand-edit outputs)
- [x] `gitleaks dir artifacts/reports/correlation-test.csv --config .gitleaks.toml --no-banner --redact=100` and the same
      for `mttr-baseline.json` → no leaks
- [x] `grep -nE "grafana\.net|supabase|pooler|@" artifacts/reports/correlation-test.csv artifacts/reports/mttr-baseline.json` → no hits
- [x] every trace id in the CSV matches `^[0-9a-f]{32}$`

> **Checkpoint (GREEN):** AC-001, AC-003, AC-004, AC-005 (ai-worker) evidenced.

### Phase 3: Truthful artifacts, docs, tracking

#### Step 13: Sentry config rewrite
**Type:** implementation
**Files to Modify:**
- `infra/monitoring/sentry-project-config.json`

Describe real wiring only (spec Part 3). No DSN value, hosts, `example.com`, `placeholder`, integrations or keys.

**Validation:**
- [x] `node -e "JSON.parse(require('fs').readFileSync('infra/monitoring/sentry-project-config.json','utf8'))"`
- [x] `grep -nE "placeholder|example\.com|ingest\.sentry|https?://" infra/monitoring/sentry-project-config.json` → no hits
- [x] gitleaks dir on the file → clean

#### Step 14: Docs corrections + dependency chain
**Type:** docs
**Files to Modify:**
- `docs/observability/IFC-074-IMPLEMENTATION.md`
- `docs/operations/incident-runbook.md`
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/integrations-dependency-chain.md`

IMPLEMENTATION.md: status line + unbacked `[x]` claims → true status, links to spec/collector. Runbook: alert delivery
proven (IFC-032), detection proven for ai-worker, post-deploy evidence step (one real tRPC call, then
`collect-observability-evidence.mjs --since <deployTs>`). Chains: add IFC-074 under "Observability Stack" in
`complete-dependency-chains.md` (section at :1789) and in the "2. Observability Stack" overview table + chain of
`integrations-dependency-chain.md` (:92).

**Validation:**
- [x] `grep -c "IFC-074" docs/architecture/diagrams/complete-dependency-chains.md docs/architecture/diagrams/integrations-dependency-chain.md` ≥ 1 each
- [x] `pnpm exec prettier --check docs/observability/IFC-074-IMPLEMENTATION.md docs/operations/incident-runbook.md docs/architecture/diagrams/complete-dependency-chains.md docs/architecture/diagrams/integrations-dependency-chain.md`

#### Step 15: Findings tracking (out of scope, not fixed)
**Type:** governance
**Files to Create:**
- `.specify/sprints/sprint-18/findings/IFC-074-findings.md`
**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`

F1–F13 from the spec: one `gh issue create` each (file:line + proposed fix), one debt-ledger item each
(`IFC074-F<n>-...`), findings doc table linking issue numbers.

**Validation:**
- [x] `gh issue list --search "IFC-074 in:title" --state open` lists 13 issues
- [x] `node -e "require('js-yaml').load(require('fs').readFileSync('artifacts/metrics/debt-ledger.yaml','utf8'));console.log('ok')"`
      (js-yaml resolves from the repo root — verified 2026-10-22)

#### Step 16: Rebuild task tracking (remove fabricated values)
**Type:** governance
**Files to Modify:**
- `.specify/sprints/sprint-1/attestations/IFC-074/task-tracking.json`

`kpis.*.actual/met` → collector values (MTTD mean seconds/met; correlation boolean from AC-001) or `null`; fabricated
`completed_at`/`execution` values nulled or annotated; append `status_history`; blockers 2-3 resolved with the
collector output SHA-256s; close-rule blocker stays open (AC-002). Validate against
`apps/project-tracker/docs/metrics/schemas/task-tracking.schema.json`.

**Validation:**
- [x] exits 0 (verified working 2026-10-22 on the current file; the ajv store path is pinned to the current lockfile — if it moves, use `require(require.resolve("ajv",{paths:["."]}))`):
      `node -e "const Ajv=require('./node_modules/.pnpm/ajv@8.20.0/node_modules/ajv');const a=new Ajv({strict:false,validateFormats:false,allErrors:true});const v=a.compile(require('./apps/project-tracker/docs/metrics/schemas/task-tracking.schema.json'));const ok=v(require('./.specify/sprints/sprint-18/attestations/IFC-074/task-tracking.json'));console.log(ok,JSON.stringify(v.errors));process.exit(ok?0:1)"`

#### Step 17: ADR-086 → Accepted
**Type:** docs
**Files to Modify:**
- `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md`
- `docs/architecture/adr/README.md`

After Steps 8-12 validate the decision. Also correct the stale "Future ADRs use IDs 081+" note
(`adr/README.md:297`) to the next free number after checking sibling claims.

**Validation:**
- [x] status line reads Accepted in both files

> **Checkpoint (Phase 3):** Step 16 ajv command exits 0; Step 15 js-yaml command prints ok; prettier --check on the
> Step 14 docs; `gitleaks dir infra/monitoring/sentry-project-config.json --config .gitleaks.toml --no-banner --redact=100`
> clean; `grep -nE "placeholder|example[.]com" infra/monitoring/sentry-project-config.json` no hits.

### Phase 4: REFACTOR

#### Step 18: Clean-up, lint, typecheck
**Type:** refactor
**Files to Modify:**
- All files touched above (no new files)

**Validation:**
- [ ] `pnpm --filter @intelliflow/observability typecheck && pnpm --filter @intelliflow/observability lint`
- [ ] `pnpm --filter @intelliflow/api typecheck && pnpm --filter @intelliflow/api lint`
- [ ] `pnpm exec eslint tools/scripts/observability/collect-observability-evidence.mjs tools/scripts/lib/grafana-provisioning.mjs tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/lib/grafana-provisioning.test.ts`

### Phase 5: VALIDATION

#### Step 19: Full validation + review gates
**Type:** validation
**Files to Create:**
- `.specify/sprints/sprint-18/execution/IFC-074/<run-id>/` (validation logs saved as `.txt`, delivery report; not counted)

- [ ] Validation Matrix below, all green, logs saved as `.txt`
- [ ] `node scripts/codex-review.mjs` clean (or waivers with evidence)
- [ ] `/code-review` on the diff; `/sonarqube-fix` for new findings
- [ ] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0

#### Step 20: Attestation + Sprint_plan closing state
**Type:** governance
**Files to Create:**
- `.specify/sprints/sprint-18/attestations/IFC-074/attestation.json`
**Files to Modify:**
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan_B.csv`

`/exec-attestation` writes the sprint-18 attestation (AC-002 NEEDS_HUMAN, real exit codes + SHA-256). In
`Sprint_plan.csv`: status back to **In Progress** (owner ruling, AC-009) and the EVIDENCE path repointed from
`.specify/sprints/sprint-1/attestations/IFC-074/attestation.json` to
`.specify/sprints/sprint-18/attestations/IFC-074/attestation.json`; then regenerate splits.

**Validation:**
- [ ] `npx tsx tools/scripts/split-sprint-plan.ts`, then `git diff --stat apps/project-tracker/docs/metrics/_global/`
      shows only `Sprint_plan.csv` + `Sprint_plan_B.csv` (any other regenerated split is reported, not committed)
- [ ] `pnpm run validate:schemas` exits 0 (covers `.specify/sprints/sprint-*/attestations/*/attestation.json`)
- [ ] `grep '^IFC-074,' apps/project-tracker/docs/metrics/_global/Sprint_plan_B.csv` shows `In Progress` and the
      sprint-18 EVIDENCE path

## Final Validation

1. Run every command in the Validation Matrix (Node 22.14.0; slot wrapper for full suites/builds).
2. Diff-coverage ≥ 80 % on changed lines (only the collector main guard uncovered).
3. Builds pass for touched packages.
4. Check AC-001…AC-009 and NF-001…NF-004 (traceability below).

## Validation Matrix

| Scope | Purpose | Command |
|-------|---------|---------|
| New/changed observability tests | Real record, redact, OTLP interop | `pnpm --dir packages/observability exec vitest run src/logging.test.ts src/pino-otlp.test.ts` |
| observability full suite | Regression | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 -- pnpm --filter @intelliflow/observability test` |
| api new/changed tests | Logger + middleware | `pnpm --dir apps/api exec vitest run src/tracing/logger.test.ts src/tracing/middleware.test.ts src/__tests__/trpc.test.ts` |
| api full suite | Every router passes through the middleware | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 -- pnpm --filter @intelliflow/api test` |
| tools tests | Collector + helpers + sibling Grafana scripts | `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` |
| Typecheck | observability, api | `pnpm --filter @intelliflow/observability typecheck` · `pnpm --filter @intelliflow/api typecheck` |
| Lint | observability, api, tools files | `pnpm --filter @intelliflow/observability lint` · `pnpm --filter @intelliflow/api lint` · eslint on the four tools files |
| Build | observability, api | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 -- pnpm --filter @intelliflow/observability build` · `... -- pnpm --filter @intelliflow/api build` |
| Coverage + diff-coverage | NF-004 | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 -- pnpm test:coverage` then `node scripts/check-diff-coverage.mjs` |
| Secret hygiene | NF-001 | `gitleaks dir <each evidence file> --config .gitleaks.toml --no-banner --redact=100` · `sh .gitleaks/scan.sh staged` |
| Overhead | NF-003 | `pnpm --dir apps/api exec vitest run src/tracing/tracing.test.ts` |
| Evidence | AC-001/004/005 | Step 12 run (exit code + SHA-256 recorded) |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|------------|--------------|---------|
| 7 | RED: new tests fail for missing code | each Step 2-7 command |
| 8 | observability green + built | `pnpm --filter @intelliflow/observability test && pnpm --filter @intelliflow/observability build` |
| 10 | api tracing green | `pnpm --dir apps/api exec vitest run src/tracing src/__tests__/trpc.test.ts` |
| 11 | tools green | root-project command above |
| 12 | evidence real + clean | collector exit code, gitleaks, grep |
| 18 | quality | typecheck + lint commands |
| 17 | Phase 3 artifacts valid | ajv + js-yaml + prettier + gitleaks (Phase 3 checkpoint) |
| 19 | full matrix | Validation Matrix |
| 20 | closing state | `pnpm run validate:schemas`; CSV grep |

## Traceability (spec → plan)

| Spec item | Step(s) |
|-----------|---------|
| AC-001 ai-worker correlation | 7, 11, 12 |
| AC-002 api correlation (NEEDS_HUMAN post-deploy) | 9, 10, 14 (runbook step), 20 (attestation NEEDS_HUMAN) |
| AC-003 api pino records | 2, 3, 4, 5, 8, 9, 10 |
| AC-004 MTTD measured | 7, 11, 12 |
| AC-005 root cause identifiable | 7, 11, 12 |
| AC-006 Sentry config truthful | 13 |
| AC-007 fabricated entries removed | 16, 20 |
| AC-008 ADR + docs | 14, 17 |
| AC-009 row stays In Progress | 20 |
| NF-001 secret hygiene | 7, 12, 13, 19 |
| NF-002 GET only / token | 6, 7 |
| NF-003 overhead | Validation Matrix (tracing.test.ts) |
| NF-004 diff-coverage | 19 |
| Findings F1–F13 | 15 |

## Files Summary

**Create (8):** `packages/observability/src/pino-otlp.test.ts`, `apps/api/src/tracing/logger.test.ts`,
`apps/api/src/tracing/logger.ts`, `tools/scripts/__tests__/collect-observability-evidence.test.ts`,
`tools/scripts/observability/collect-observability-evidence.mjs`,
`tools/scripts/observability/collect-observability-evidence.d.mts`, `.specify/sprints/sprint-18/findings/IFC-074-findings.md`,
`.specify/sprints/sprint-18/attestations/IFC-074/attestation.json` (execution logs under
`.specify/sprints/sprint-18/execution/IFC-074/<run-id>/` not counted)

**Modify (23):** `packages/observability/package.json`, `pnpm-lock.yaml`, `packages/observability/src/logging.test.ts`,
`packages/observability/src/logging.ts`, `apps/api/src/test/setup.ts`, `apps/api/src/tracing/middleware.test.ts`,
`apps/api/src/__tests__/trpc.test.ts`, `apps/api/src/tracing/middleware.ts`, `tools/scripts/lib/grafana-provisioning.test.ts`,
`tools/scripts/lib/grafana-provisioning.mjs`, `artifacts/reports/correlation-test.csv`,
`artifacts/reports/mttr-baseline.json`, `infra/monitoring/sentry-project-config.json`,
`docs/observability/IFC-074-IMPLEMENTATION.md`, `docs/operations/incident-runbook.md`,
`docs/architecture/diagrams/complete-dependency-chains.md`, `docs/architecture/diagrams/integrations-dependency-chain.md`,
`artifacts/metrics/debt-ledger.yaml`,
`.specify/sprints/sprint-1/attestations/IFC-074/task-tracking.json`,
`docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md`, `docs/architecture/adr/README.md`,
`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`, `apps/project-tracker/docs/metrics/_global/Sprint_plan_B.csv`

**Total: 31 files.**

## CSV Artifact Alignment

| CSV artifact | In plan? | Note |
|--------------|----------|------|
| `infra/monitoring/sentry-project-config.json` | Yes (Step 13) | rewritten |
| `artifacts/reports/correlation-test.csv` | Yes (Step 12) | regenerated by collector |
| `artifacts/reports/mttr-baseline.json` | Yes (Step 12) | regenerated by collector |
| `packages/observability/{package.json,src/logging.ts}` | Yes (Steps 1, 8) | modified |
| `packages/observability/{tsconfig.json,src/index.ts,src/tracing.ts,src/metrics.ts,src/tracer.ts}` | Existing, unchanged | exist on disk (verified 2026-10-22) |
| `apps/api/src/tracing/example.ts` | Existing, unchanged | exists |
| `EVIDENCE:.specify/sprints/sprint-1/attestations/IFC-074/attestation.json` | Step 20 | Row is Target Sprint 18: the new attestation goes to `.specify/sprints/sprint-18/attestations/IFC-074/attestation.json`; the CSV EVIDENCE path is updated to it in Step 20 (sprint-1 file kept as history) |

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (`.claude/agents/plan-reviewer.md`, spawned via the Agent tool, 2026-10-22)

| Iteration | Verdict | Summary |
|-----------|---------|---------|
| 1 | REVISE (4 ERROR, 5 WARN, 2 INFO) | missing domain chain file; Sprint_plan CSVs + attestation owned by no step; effort counts; inexact schema commands; Step 7 MTTD sub-cases; RED checkpoint wording; no Phase 3 checkpoint; `.d.mts` consumer; lockfile check; stale ADR note |
| 2 | REVISE (1 ERROR, 1 WARN) | effort-table per-row counts; pinned ajv path |
| 3 | APPROVE (0 ERROR, 0 WARN) | all fixes verified; Category Y (UI reachability) N/A — no page/route; CC N/A; traceability complete |

ceremony_tier: full
