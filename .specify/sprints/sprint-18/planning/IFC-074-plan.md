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
- [x] `pnpm --filter @intelliflow/observability typecheck && pnpm --filter @intelliflow/observability lint`
- [x] `pnpm --filter @intelliflow/api typecheck && pnpm --filter @intelliflow/api lint`
- [x] `pnpm exec eslint tools/scripts/observability/collect-observability-evidence.mjs tools/scripts/lib/grafana-provisioning.mjs tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/lib/grafana-provisioning.test.ts`

### Phase 5: VALIDATION

#### Step 19: Full validation + review gates
**Type:** validation
**Files to Create:**
- `.specify/sprints/sprint-18/execution/IFC-074/<run-id>/` (validation logs saved as `.txt`, delivery report; not counted)

- [x] Validation Matrix below, all green, logs saved as `.txt`
  - evidence (2026-10-29): execution/IFC-074/20261022194925-cdddf208/logs/18-*.txt and 19-*.txt (typecheck, lint, build, tests, coverage, diff-coverage), 2026-10-22
- [x] `node scripts/codex-review.mjs` clean (or waivers with evidence)
  - evidence (2026-10-29): execution/IFC-074/20261022194925-cdddf208/logs/19-codex-review-iter5.txt: "Verdict: PASS", "Gate PASS — no unwaived findings"
- [ ] `/code-review` on the diff; `/sonarqube-fix` for new findings
  - open (2026-10-29): not run as skills for this rebuild: /code-review quick ran on 2026-10-22 only (execution/IFC-074/20261022194925-cdddf208/IFC-074-delivery.md:78); /sonarqube-fix was not run. The 4 SonarCloud bugs on PR #1073 (S2871 x2, S6959, S9383) were fixed by hand in the 2026-10-29 review commit (execution/IFC-074/20261029-addendum/logs/sonar-fix.txt); the PR's SonarCloud gate re-runs on push
- [x] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0
  - evidence (2026-10-29): 0 on 2026-10-29 (git ls-files | grep -cE ... = 0; also STOA-Foundation execution/IFC-074/20261029-addendum/matop)

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
- [x] `npx tsx tools/scripts/split-sprint-plan.ts`, then `git diff --stat apps/project-tracker/docs/metrics/_global/`
      shows only `Sprint_plan.csv` + `Sprint_plan_B.csv` (any other regenerated split is reported, not committed)
  - evidence (2026-10-29): commit 27ff7e70d touches only Sprint_plan.csv and Sprint_plan_B.csv under _global/
- [ ] `pnpm run validate:schemas` exits 0 (covers `.specify/sprints/sprint-*/attestations/*/attestation.json`)
  - open (2026-10-29): pnpm validate:schemas exits 1 repo-wide on 252 pre-existing invalid records (F17, #1070); the IFC-074 sprint-18 attestation itself validates (execution/IFC-074/20261029-addendum/logs/validate-schemas.txt)
- [x] `grep '^IFC-074,' apps/project-tracker/docs/metrics/_global/Sprint_plan_B.csv` shows `In Progress` and the
      sprint-18 EVIDENCE path
  - evidence (2026-10-29): verified 2026-10-29: the row shows In Progress and .specify/sprints/sprint-18/attestations/IFC-074/attestation.json

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

---

# Addendum plan, 2026-10-29 (spec addendum: D1-D9, AC-010-AC-016)

**Base:** `agent/IFC-074-observability` at `7dea5067e` (origin/main `9e378fbb0` + the 2026-10-22 work + the spec addendum
commits `5aa92bc64` and `7dea5067e`). Steps 1-20 above are the 2026-10-22 plan, already executed (delivery report
`execution/IFC-074/20261022194925-cdddf208/`); they are not re-run except where a step below names them. Steps here are
numbered A1-A14. Every step uses TDD (RED test first, watched failing, then GREEN).

## Addendum Preflight Checks
- [x] `git log --oneline -1` shows the addendum spec commit; `git status --porcelain` is empty, or holds only generated
  leftovers listed for the coordinator.
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/preflight.txt: gate-4b "Working tree is clean" at HEAD abce7dfaf (plan commit on spec commit 7dea5067e)
- [x] Node 24 on PATH (`/c/Users/talys/ops/node24/node-v24.21.0-win-x64`), `NODE_OPTIONS=--max-old-space-size=8192`.
  - evidence (2026-10-29): attestation environment.node_version "v24.21.0"
- [ ] Packages built (`pnpm exec turbo build --filter='./packages/*'`, through `with-slot.mjs --label IFC-074`).
  - open (2026-10-29): no log saved for the package build before A-RED, so it is not claimed
- [x] `grep -n "schema_version" tools/scripts/observability/collect-observability-evidence.mjs` shows `'2.2.0'`
  (the base value the bump starts from).
  - evidence (2026-10-29): git show abce7dfaf:tools/scripts/observability/collect-observability-evidence.mjs:1191 schema_version '2.2.0'
- [x] The datasource uid `grafanacloud-alert-state-history` is already used by the collector (`DS.history`, `:46`), so
  it exists on the stack (the collector read it on 2026-10-22).
  - evidence (2026-10-29): git show abce7dfaf:...collect-observability-evidence.mjs:46 history: 'grafanacloud-alert-state-history'
- [ ] Free RAM >= 6 GB before any test run; one test process at a time.
  - open (2026-10-29): free RAM was not recorded

## Addendum Implementation Reality Checks
- **Runtime consumers:**
  - the collector's Loki routing is called by `checkRepoRules` → `run()` (`collect-observability-evidence.mjs`), which
    Aurora runs locally after deploy;
  - `datasourceProxy`'s uid check sits on every read helper (`lokiQueryRange`, `tempoSearch`, `promInstantQuery`,
    `promRangeQuery`);
  - the dashboard panel is applied by `grafana-dashboard.yml` on merge (`apply-grafana-dashboard.mjs run()`);
  - the KPI `source` field is read by `apps/project-tracker/lib/data-sync/task-json-builder.ts` (`generate:metrics`);
  - the attestation `kpi_results` are read by `/api/tasks/validation-summary/[taskId]` (TaskModal).
- **Replacement:** no legacy path is replaced. The dispatch workflow from the consensus draft is **not** built
  (ruling 4).
- **No new workflow, token or secret.** The collector header stays "local only, never in CI".

## Addendum Estimated Effort

| Area | Files modified | Files created |
|------|----------------|---------------|
| Collector + lib | `collect-observability-evidence.mjs`, `collect-observability-evidence.d.mts`, `grafana-provisioning.mjs` | — |
| Collector tests | `collect-observability-evidence.test.ts`, `grafana-provisioning.test.ts` | — |
| Dashboard | `dashboard-production.json`, `apply-grafana-dashboard.mjs`, `apply-grafana-dashboard.test.ts` | — |
| Schema + KPI record | `task-status.schema.ts` (Zod), `task-status.schema.json` (regenerated), `task-tracking.json` | `tools/scripts/__tests__/task-status-kpi-schema.test.ts` |
| Logger key set | `packages/observability/src/logging.test.ts` | — |
| Docs + tracking | `ADR-086-…md`, `debt-ledger.yaml`, `IFC-074-spec.md` (status only), `Sprint_plan.csv` | run dir `execution/IFC-074/20261029-addendum/`: `IFC-074-delivery.md`, `findings.md`, `logs/a-red.txt` |
| Attestation | — | `attestations/IFC-074/attestation.json`, `attestation-latest.json` |

Total: 16 modified, 6 created (plus the regenerated `docs/metrics/sprint-18/IFC-074.json`, the Sprint_plan splits and
additional `logs/*.txt` as validation runs).
Estimate (O/M/P): 4 / 6 / 9 h.

## Addendum Execution Steps

### Phase A1: RED

#### Step A1: Collector Loki routing tests (AC-010, AC-011)
File: `tools/scripts/__tests__/collect-observability-evidence.test.ts`
- [x] Make `fakeGrafana` (`:78-163`) strict per datasource uid:
  - a Prometheus path (`/api/v1/query`, `/api/v1/query_range`) under `/proxy/uid/grafanacloud-logs/` returns 404;
  - a Loki path under `/proxy/uid/grafanacloud-prom/` returns 404;
  - a new `cfg.lokiMetric(query, start, end, step)` hook answers Loki matrix queries.
  - evidence (2026-10-29): commit b1ec09b6f (fakeGrafana strict per uid, lokiMetric hook)
- [ ] Add these tests:
  - `routes a Loki rule to the logs datasource`: `grafana.calls` include
    `/api/datasources/proxy/uid/grafanacloud-logs/loki/api/v1/query_range`; the decoded `query` equals
    `(<rule expr>) > 0` and `step` equals `60`; there is no `/api/v1/query*` under `grafanacloud-prom` for that rule.
  - `Loki probe uses query_range with start equal to end`.
  - `Loki timeline counts steps meeting the rule's operator and threshold` (includes a value exactly at the threshold,
    so `gt` is strict).
  - `Prometheus rules still use the prom proxy` (regression guard).
  - `an unknown datasource uid is not_checked and the run still writes` (exit 0, `not_checked: "unknown_datasource"`).
  - `a Loki-rule transition labelled only service_name="ai-worker" anchors to an ai-worker episode`
    (`fetchTransitions` falls back to `labels.service_name`).
  - `a span-rule transition still anchors to its episode and keeps its earliest error span` (regression).
  - `no :60s] subquery is ever sent to the Loki proxy` (I1).
  - `allowlist accepts datasource_kind, not_checked and lookback_s, and still rejects an unknown key`. This is one case
    per new field, run at runtime through `assertSafeKeys` (W7).
  - `a Loki series without service_name matches only an episode without a service`.
  - `Loki checks report lookback_s capped at 6 h` and `an empty Loki matrix gives first_true_s null`.
  - `repo_rule_checks carry datasource_kind`, plus an allowlist-rejection case for an unknown key.
  - `schema_version is 2.3.0` (pins the string).
  - open (2026-10-29): 10 tests landed in "a repo rule on the Loki datasource" (b1ec09b6f) and cover the routing, probe, timeline, service_name, regression, unknown-uid and 2.3.0 cases; the per-field runtime allowlist cases and a separate unknown-key rejection case were folded into one "new keys pass the output key check" test, so this list is not met as written (existing fail-closed tests cover rejection)
- [x] Run (expect FAIL): `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/a-red.txt (A1: 10 failing of 79)

#### Step A2: `datasourceProxy` uid tests (AC-011, D2)
File: `tools/scripts/lib/grafana-provisioning.test.ts`
- [x] Add `datasourceProxy accepts grafanacloud-prom, grafanacloud-logs, grafanacloud-alert-state-history` through
  `lokiQueryRange` and `promInstantQuery` paths.
  - evidence (2026-10-29): commit b1ec09b6f (grafana-provisioning.test.ts uid accept cases)
- [x] Add `rejects ../x, a/b, a?b, empty and a 65-char uid with "invalid datasource uid"`. The error text must not
  contain the uid.
  - evidence (2026-10-29): commit b1ec09b6f (5 rejection cases)
- [x] Run (expect FAIL): `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/a-red.txt (A2: 5 failing of 62)

#### Step A3: Dashboard panel tests (AC-016, D8)
File: `tools/scripts/__tests__/apply-grafana-dashboard.test.ts`
- [x] Change `is valid, with a fixed uid … and five panels` (`:66`) to six panels.
  - evidence (2026-10-29): commit 63a78bc1a (six panels)
- [x] Restrict `queries only the span-metric series…` (`:73`) and `matches only the services that emit telemetry`
  (`:82`) to Prometheus targets (`datasource.uid === 'grafanacloud-prom'`). Add the Loki counterparts:
  - every Loki target reads an allowed Loki uid;
  - every Loki selector is `{service_name="ai-worker"}` or `{from="state-history"}` (E4).
  - evidence (2026-10-29): commit 63a78bc1a (Prometheus-only checks + Loki counterparts)
- [x] Replace `reads every target from the Grafana Cloud Prometheus datasource` (`:94`) with: every Prometheus target
  reads `grafanacloud-prom`, and every Loki target reads `grafanacloud-logs` or `grafanacloud-alert-state-history`.
  - evidence (2026-10-29): commit 63a78bc1a
- [x] Add `has an "MTTD per error episode (live proxy)" panel`. It has three targets:
  - A: a prom error-span rate with `status_code="STATUS_CODE_ERROR"`;
  - B: Loki error-level lines with the same filter text as `ifc074-error-logs-direct`. The test reads the rule's expr
    from `alert-rules.json` and asserts the panel uses the same stream selector and level filter;
  - C: state-history Alerting transitions.
  - evidence (2026-10-29): commit 63a78bc1a; targets moved to [$__interval] in e7a70213e

  Its `description` names `artifacts/reports/mttr-baseline.json` and the IFC-074 task KPI, and contains "proxy".
- [x] Add `validateConfig` cases:
  - it rejects a Loki target on `grafanacloud-prom` or an unknown uid;
  - it rejects a Loki selector other than `{service_name="ai-worker"}` or `{from="state-history"}`;
  - it still rejects a Prometheus target that breaks today's metric and service checks;
  - it accepts the committed dashboard.
  - evidence (2026-10-29): commit 63a78bc1a
- [x] Run (expect FAIL): `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-dashboard.test.ts`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/a-red.txt (A3: 9 failing of 31)

#### Step A4: KPI schema tests (AC-012, D7)
- [x] NEW `tools/scripts/__tests__/task-status-kpi-schema.test.ts`. It tests both the Zod `kpiEntrySchema`
  (`tools/scripts/lib/schemas/task-status.schema.ts:144`) and the generated
  `apps/project-tracker/docs/metrics/schemas/task-status.schema.json` through Ajv, the same path `generate:metrics`
  validates with (E2).
  - evidence (2026-10-29): commit ea2a117b8 (new task-status-kpi-schema.test.ts; the JSON half is read structurally, not via Ajv: delivery Deviations A4)
- [x] Add these cases:
  - a KPI with a string `source` validates;
  - a KPI with another extra key fails;
  - `met: null` fails;
  - `met: false` validates.
  - evidence (2026-10-29): commit ea2a117b8 (8 tests)
- [x] Run (expect FAIL on the `source` case):
  `pnpm exec vitest run --project root tools/scripts/__tests__/task-status-kpi-schema.test.ts`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/a-red.txt (A4: 4 failing of 8)

#### Step A5: Logger key-set test (AC-015, D5)
File: `packages/observability/src/logging.test.ts`, using the in-memory destination harness at `:148-218`
- [x] Add `an api request record under a protected context carries tenantId and userId`. It calls a real `createLogger`
  inside `runWithLogContext({ correlationId, tenantId, userId }, …)` and emits the exact record shape
  `apiLog('info', …)` sends (`type, correlationId, path, method, durationMs, status`; mirrored from
  `apps/api/src/tracing/middleware.ts:180-191`). It asserts `Object.keys` of the parsed line equals the expected set.
  - evidence (2026-10-29): commit 09efaeaef (logging.test.ts key-set test)
- [x] Add `the same record with no log context has neither tenantId nor userId`.
  - evidence (2026-10-29): commit 09efaeaef
- [x] Both may pass at once (they document existing behaviour, D5 keeps both keys). Record this in the delivery report
  as characterisation tests, not RED. The api half of AC-015 is the existing `middleware.test.ts:83-86,318-348`
  record-shape assertions, which are unchanged.
  - evidence (2026-10-29): delivery report "TDD log": A5 recorded as a characterisation test
- [x] Run: `pnpm --filter @intelliflow/observability exec vitest run src/logging.test.ts`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/tests.txt (observability 46/46)

Checkpoint A-RED: the A1-A4 suites fail for the expected reasons only (no import or syntax errors). The failure lines
are saved to `execution/IFC-074/20261029-addendum/logs/a-red.txt`.

### Phase A2: GREEN

#### Step A6: `datasourceProxy` uid check (D2)
File: `tools/scripts/lib/grafana-provisioning.mjs:252`
- [x] Throw `new Error('invalid datasource uid')` unless the uid matches `/^[A-Za-z0-9_-]{1,64}$/`.
  - evidence (2026-10-29): commit b1ec09b6f (grafana-provisioning.mjs datasourceProxy)
- [x] Run A2 (PASS) and the whole of `grafana-provisioning.test.ts`.
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/tests.txt (root 215/215 incl. grafana-provisioning.test.ts)

#### Step A7: Collector Loki routing (D1)
File: `tools/scripts/observability/collect-observability-evidence.mjs` (+ `.d.mts`)
- [x] Import `DATASOURCE_KINDS` from `../lib/grafana-provisioning.mjs`; `ruleKind(rule, config)` returns
  `DATASOURCE_KINDS[rule.datasourceUid ?? config.datasourceUid]`.
  - evidence (2026-10-29): commit b1ec09b6f; the kind is set per rule in loadRepoRules (Object.hasOwn on DATASOURCE_KINDS) rather than a separate ruleKind helper
- [x] `conditionHeld`, `conditionTimeline` and `trueAtProbe` branch on the kind:
  - Prometheus: unchanged;
  - Loki: `lokiQueryRange` with `step=60` (probe: `start=end`), the lookback capped by
    `LOKI_CONDITION_LOOKBACK_MAX_S = 6 * 3600`, reading the matrix `values`, and the series service from
    `metric.service_name` (no alias: the spec's D1 dropped it, because production has only `ai-worker` and `api`,
    as the coordinator confirmed live 2026-10-29);
  - the new matcher is `sameLokiService`, distinct from the local `sameService` at `:801`.
  - evidence (2026-10-29): commit b1ec09b6f (lokiCondition/lokiConditionHeld, sameLokiService; conditionTimeline and trueAtProbe branch on kind)
- [x] `fetchTransitions` (`:423-449`): `service = labels.service ?? labels.service_name ?? 'unknown'`. No
  normalisation is applied, so `earliestErrorSpan` (`:995`) and the Prometheus `sameService` see the same service
  strings as today (E1).
  - evidence (2026-10-29): commit b1ec09b6f (service ?? service_name ?? 'unknown')
- [x] An unknown kind gives `{ uid, datasource_kind: null, not_checked: 'unknown_datasource' }`, and the loop continues.
  - evidence (2026-10-29): commit b1ec09b6f (not_checked: 'unknown_datasource')
- [x] Add `datasource_kind`, `not_checked` and `lookback_s` to the output allowlist and the `.d.mts`, and set
  `schema_version: '2.3.0'`, all in one commit with the per-episode computation unchanged.
  - evidence (2026-10-29): commit b1ec09b6f (allowlist, .d.mts, schema_version '2.3.0')
- [x] Run A1 (PASS) and the whole collector suite.
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/tests.txt; post-Sonar-fix re-run 79/79 in execution/IFC-074/20261029-addendum/logs/sonar-fix.txt

#### Step A8: Dashboard panel and validator (D8)
Files: `infra/monitoring/grafana/cloud/dashboard-production.json`, `tools/scripts/observability/apply-grafana-dashboard.mjs`
- [x] Add a `timeseries` panel titled "MTTD per error episode (live proxy)" at `gridPos {x:0,y:22,w:24,h:8}`. Its
  description: "Live proxy, not the KPI: shows error signals and alert firings per minute; the gap is detection delay.
  The official MTTD (first alert per error episode) is the collector result in artifacts/reports/mttr-baseline.json and
  the IFC-074 task KPI." Targets:
  - A (prom `grafanacloud-prom`):
    `sum by (service) (increase(traces_spanmetrics_calls_total{service=~"ai-worker|api", status_code="STATUS_CODE_ERROR"}[1m]))`
  - B (Loki `grafanacloud-logs`): the rule's stream selector and level filter, with `[1m]` and `sum by (service_name)`.
  - C (Loki `grafanacloud-alert-state-history`):
    `sum by (ruleUID) (count_over_time({from="state-history"} | json | current=~"Alerting.*" and previous!~"Alerting.*" [1m]))`
  - evidence (2026-10-29): commit 63a78bc1a; deviation: all three targets use [$__interval] (panel interval 1m) instead of [1m], e7a70213e, after the independent review

  Target A's service regex is limited to `ALLOWED_SERVICES` (`api`, `ai-worker`), as today's validator requires.
  Resolved (E3): the coordinator checked live on 2026-10-29. The combined worker has `OTEL_SERVICE_NAME=ai-worker`,
  and Tempo, span metrics and Loki show only `ai-worker` and `api`. `ALLOWED_SERVICES` is therefore unchanged.
- [x] Loki targets carry `datasource: { type: "loki", uid }` and `queryType: "range"` (W1). Their LogQL is unproven
  until the live check after the merge applies it; the delivery report says so.
  - evidence (2026-10-29): commit 63a78bc1a; LogQL stays unproven until the post-merge apply (delivery AC-016)
- [x] `validateConfig`:
  - each target's kind comes from its `datasource.uid` (`grafanacloud-prom` → today's checks);
  - Loki uids `grafanacloud-logs` and `grafanacloud-alert-state-history` accept only the selectors
    `{service_name="ai-worker"}` or `{from="state-history"}`;
  - any other uid is reported as a problem.
  - evidence (2026-10-29): commit 63a78bc1a (apply-grafana-dashboard.mjs PROM_UID, LOKI_STREAMS, checkLokiExpr)
- [x] Run A3 (PASS).
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/tests.txt (apply-grafana-dashboard 31/31 in the root run)

#### Step A9: KPI schema and task record (D7)
- [ ] `tools/scripts/lib/schemas/task-status.schema.ts` `kpiEntrySchema`: add
  `source: z.string().optional().describe('Evidence file and SHA-256 behind the actual value')`. Then run
  `pnpm generate:schemas` and commit the regenerated `task-status.schema.json`. Never hand-edit the JSON (E2).
  - open (2026-10-29): the Zod line landed (ea2a117b8), but the JSON was not regenerated wholesale: pnpm generate:schemas rewrote 11 schema files (Zod 4.6.7 drift, F18 #1071), so only the generator's exact source fragment was added (delivery Deviations A9)
- [x] `.specify/sprints/sprint-18/attestations/IFC-074/task-tracking.json`:
  - set `kpis.traces_correlating.met: false`;
  - append a `status_history` entry dated 2026-10-29 explaining "met:false = not demonstrated (api row NOT_OBSERVED
    until deploy)" and ruling 4;
  - set `mttd_target.actual` to the string "4.479 min per-incident mean (2026-10-22, before #1040/#1062; not
    comparable with the per-episode KPI); post-deploy per-episode measurement pending" with `met: false`. Keep
    `source` (the 2026-10-22 sha256) and append a history note, so the tracker never shows a bare legacy number as
    the KPI (W2).
  - evidence (2026-10-29): commit ea2a117b8 (traces_correlating met false, caveated mttd_target.actual, history entry)
- [ ] Run A4 (PASS), then `npx tsx tools/scripts/validate-schemas.ts`.
  - open (2026-10-29): A4 passes (execution/IFC-074/20261029-addendum/logs/tests.txt), but validate-schemas exits 1 on pre-existing drift (F17); see execution/IFC-074/20261029-addendum/logs/validate-schemas.txt and the KPI-subtree check execution/IFC-074/20261029-addendum/logs/a9-cache-kpi-check.txt
- [x] Run `pnpm generate:metrics`, then confirm `apps/project-tracker/docs/metrics/sprint-18/IFC-074.json` carries
  that `mttd_target.actual` string and validates.
  - evidence (2026-10-29): apps/project-tracker/docs/metrics/sprint-18/IFC-074.json:84 carries the caveated actual; its kpis subtree validates (execution/IFC-074/20261029-addendum/logs/a9-cache-kpi-check.txt)

### Phase A3: Docs, findings, tracking

#### Step A10: ADR-086 amendment (AC-014, D5, D6, D8)
File: `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md`. It is already **Accepted**
(2026-10-22, line 3; old plan Step 17). The spec's Related Documents row saying "Proposed" is stale and is corrected
in A12 (W5). Add a dated "Amendment 2026-10-29" covering:
- #1040 and #1062 as the detection paths, with the Loki rule covering ai-worker only and the expected api miss;
- the supersession of the KPI statistic (ruling 4);
- the evidence path (local collector → task KPI → tracker) and the live-proxy panel;
- the data in api records: tenantId/userId on protected and tenant procedures only, purpose, owner-only access, Loki
  retention;
- runtime impact: log records are tRPC-only, the timer is unref'd and buffered-only, and the 60 s metrics reader is
  pre-existing.

#### Step A11: Findings F14, F15, F16
- [x] For each finding: a gh issue (`gh issue create` with file:line and the proposed fix), a debt-ledger entry in
  `artifacts/metrics/debt-ledger.yaml` (owner, severity, remediation sprint 19), and a line in the findings doc
  `execution/IFC-074/20261029-addendum/findings.md`. The findings are:
  - F14: widen the Loki rule to the api after F11;
  - F15: no Loki volume tripwire;
  - F16: DORA metrics from real deploy and incident data.
  - evidence (2026-10-29): issues #1067-#1071 (F14-F18), debt-ledger entries IFC074-F14..F19, findings in .specify/sprints/sprint-18/findings/IFC-074-findings.md (not a run-dir findings.md: delivery Deviations A11); commit 4e0b81407
- [x] Validate: `python -c "import yaml;yaml.safe_load(open('artifacts/metrics/debt-ledger.yaml',encoding='utf-8'))"`.
  - evidence (2026-10-29): python yaml.safe_load exit 0 on 2026-10-29

#### Step A12: Delivery report addendum and spec status
- [x] New run directory `.specify/sprints/sprint-18/execution/IFC-074/20261029-addendum/` holding `IFC-074-delivery.md`
  (A1-A14, TDD log with the a-red.txt excerpt, AC-010-AC-016 status, validation commands with exit codes) and
  `logs/*.txt` (never `.log`).
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/IFC-074-delivery.md + logs/*.txt (findings in the sprint findings doc instead: Deviations A11)
- [x] Mark the spec addendum's `D1`-`D9` as implemented (status line only; history kept), and add a dated note in
  Related Documents that ADR-086 is Accepted.
  - evidence (2026-10-29): spec status line :331 and Related Documents row :38
- [x] The delivery report says the 2026-10-29 sign-offs' alias condition (Backend, Test) was dropped by D1 on later
  evidence (W9). It cites that evidence: the coordinator's live check on 2026-10-29 (Railway combined-worker
  `OTEL_SERVICE_NAME=ai-worker`; Tempo, span metrics and Loki list only `ai-worker` and `api`). Method and date are
  given as relayed; no evidence file is committed (I4).
  - evidence (2026-10-29): delivery report "Deviations from the plan", Spec D1

### Phase A4: REFACTOR and VALIDATION

#### Step A13: Lint, typecheck, review
- [x] Lint: `pnpm exec eslint tools/scripts/observability/collect-observability-evidence.mjs tools/scripts/lib/grafana-provisioning.mjs tools/scripts/observability/apply-grafana-dashboard.mjs`
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/lint.txt (0 problems)
- [x] Typecheck: `pnpm --filter @intelliflow/observability typecheck` and `pnpm run typecheck`, through the slot
  wrapper.
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/typecheck.txt (40/40 turbo tasks, includes @intelliflow/observability)
- [x] Run `node scripts/codex-review.mjs --base=origin/main` twice, standalone. Any new finding goes to the coordinator
  first.
  - evidence (2026-10-29): execution/IFC-074/20261029-addendum/logs/codex-review-1.txt and codex-review-2.txt (PASS, 0 findings; 11 of 84 files in scope)
- [ ] Run `/code-review` on the diff; `/sonarqube-fix` on any new Sonar finding.
  - open (2026-10-29): /code-review and /sonarqube-fix skills were not run on the addendum; SonarCloud on PR #1073 found 4 bugs, fixed by hand in the review commit (execution/IFC-074/20261029-addendum/logs/sonar-fix.txt), and the gate is re-checked on push
- [x] Live check without a token: dispatch `grafana-dashboard.yml` with `dry_run=true` on the branch (it validates the
  dashboard config, and its "exists" read uses the CI secret), and record the run id. **Do not** apply to production
  (the apply happens on merge).
  - evidence (2026-10-29): run 40896025096 (success): "env008-production: present (would update)", "dry run: writes nothing"
- [x] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` is `0`.
  - evidence (2026-10-29): 0 on 2026-10-29

#### Step A14: Attestation and closing state (AC-013 NEEDS_HUMAN)
- [ ] Gate 4b (`node tools/scripts/exec-preflight/check-worktree-landed.mjs IFC-074 18`) must pass. That needs the
  branch pushed, so this step runs after the coordinator's slot GO, the pre-ship and the single push.
  - open (2026-10-29): after the push (execution/IFC-074/20261029-addendum/logs/gate-4b-after-push.txt): name, 27 ahead and pushed PASS; BLOCK only on uncommitted edits (first after-push run 14:5xZ: the coverage/report files pre-ship rewrites; 17:21Z run: this review round's own pending edits), so it has not exited 0 yet; re-run after the review push
- [x] `/exec-attestation` writes `attestations/IFC-074/attestation.json` + `attestation-latest.json`:
  - verdict `NEEDS_HUMAN`;
  - `kpi_results` MTTD as the spec's planned wording (`met: false`), and traces_correlating `met: false`;
  - the provenance block (`spec_session_consensus` 5/5 2026-10-29, `plan_reviewer_verdict` from this plan's sign-off);
  - `validation_results` from the real runs.
  - evidence (2026-10-29): commit 27ff7e70d (NEEDS_HUMAN, kpi_results met:false x2, provenance, real validation_results)
- [ ] Run `npx tsx tools/scripts/validate-schemas.ts` and
  `node tools/scripts/exec-preflight/check-attestation-provenance.mjs IFC-074` (both exit 0).
  - open (2026-10-29): check-attestation-provenance.mjs IFC-074 passes; validate-schemas exits 1 on pre-existing drift (F17) while the IFC-074 attestation validates (execution/IFC-074/20261029-addendum/logs/validate-schemas.txt)
- [x] Sprint_plan: the row stays **In Progress** (ruling 1). Its evidence path moves from the sprint-1 attestation to
  `.specify/sprints/sprint-18/attestations/IFC-074/attestation.json` in `Sprint_plan.csv` only. Then run
  `npx tsx tools/scripts/split-sprint-plan.ts` and the plan validation.
  - evidence (2026-10-29): commit 27ff7e70d (row In Progress, EVIDENCE -> sprint-18 attestation; splits regenerated)
- [x] PR body:
  - runtime impact (D6), with volume as an estimate;
  - the expected api miss;
  - ruling 4;
  - the post-deploy runbook, including a post-merge check that `grafana-dashboard.yml` on main logs
    `updated dashboard env008-production` with its run id, and `grafana-alert-rules.yml` likewise (W3).
  - evidence (2026-10-29): PR #1073 body: runtime impact, expected api miss, ruling 4, post-merge runbook

## Addendum Validation Matrix

| What | Command | When |
|------|---------|------|
| Collector + lib + dashboard + alert-rules regression | `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/__tests__/apply-grafana-dashboard.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/lib/grafana-provisioning.test.ts` | A6-A8 |
| Schema test | `pnpm exec vitest run --project root tools/scripts/__tests__/task-status-kpi-schema.test.ts` + `npx tsx tools/scripts/validate-schemas.ts` | A4, A9 |
| Schema regeneration | `pnpm generate:schemas`, then `git diff --stat -- apps/project-tracker/docs/metrics/schemas/` shows only the `source` addition in `task-status.schema.json` | A9 |
| Observability package (full) | `pnpm --filter @intelliflow/observability test` | A5, A13 |
| Tracker cache | `pnpm generate:metrics` + schema validate | A9 |
| Typecheck / lint | as in A13 | A13 |
| Codex review ×2 | `node scripts/codex-review.mjs --base=origin/main` | A13 |
| Dashboard live dry run | `gh workflow run grafana-dashboard.yml --ref agent/IFC-074-observability -f dry_run=true` | A13 |
| Pre-ship (coordinator's GO) | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label IFC-074 --exclusive intelliflow-db -- node scripts/test-db.mjs run --seed -- node scripts/pre-ship.mjs` | before push |

## Addendum Traceability

| Spec item | Plan steps |
|-----------|-----------|
| AC-010 | A1, A7 |
| AC-011 | A1, A2, A6, A7 |
| AC-012 | A4, A9 |
| AC-013 | A14 (NEEDS_HUMAN; post-deploy runbook in the PR body) |
| AC-014 | A10, A14 (PR body) |
| AC-015 | A5 (+ existing middleware tests) |
| AC-016 | A3, A8, A13 (dry run) |
| D9 / F16 | A11 |
| F14, F15 | A11 |

## Addendum Files Summary

**Modified (16)**
- Collector and lib (3):
  - `tools/scripts/observability/collect-observability-evidence.mjs`
  - `tools/scripts/observability/collect-observability-evidence.d.mts`
  - `tools/scripts/lib/grafana-provisioning.mjs`
- Collector tests (2):
  - `tools/scripts/__tests__/collect-observability-evidence.test.ts`
  - `tools/scripts/lib/grafana-provisioning.test.ts`
- Dashboard (3):
  - `infra/monitoring/grafana/cloud/dashboard-production.json`
  - `tools/scripts/observability/apply-grafana-dashboard.mjs`
  - `tools/scripts/__tests__/apply-grafana-dashboard.test.ts`
- Schema and KPI record (3):
  - `tools/scripts/lib/schemas/task-status.schema.ts`
  - `apps/project-tracker/docs/metrics/schemas/task-status.schema.json` (regenerated)
  - `.specify/sprints/sprint-18/attestations/IFC-074/task-tracking.json`
- Logger key set (1):
  - `packages/observability/src/logging.test.ts`
- Docs and tracking (4):
  - `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md`
  - `artifacts/metrics/debt-ledger.yaml`
  - `.specify/sprints/sprint-18/specifications/IFC-074-spec.md`
  - `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

These are regenerated and not counted: the Sprint_plan splits and the gitignored
`apps/project-tracker/docs/metrics/sprint-18/IFC-074.json` cache.

**Created (6)**
- `tools/scripts/__tests__/task-status-kpi-schema.test.ts`
- `.specify/sprints/sprint-18/execution/IFC-074/20261029-addendum/IFC-074-delivery.md`
- `.specify/sprints/sprint-18/execution/IFC-074/20261029-addendum/findings.md`
- `.specify/sprints/sprint-18/execution/IFC-074/20261029-addendum/logs/a-red.txt`
- `.specify/sprints/sprint-18/attestations/IFC-074/attestation.json`
- `.specify/sprints/sprint-18/attestations/IFC-074/attestation-latest.json`

Further `logs/*.txt` files are added as validation runs, never `.log`.

## Addendum CSV Artifact Alignment

The row's artifacts (`infra/monitoring/sentry-project-config.json`, `artifacts/reports/correlation-test.csv`,
`artifacts/reports/mttr-baseline.json`) are unchanged by this addendum. The two reports are regenerated only by the
post-deploy collector run (AC-013). The row's evidence moves to the sprint-18 attestation (A14).

## Addendum Plan-Reviewer Sign-off (2026-10-29)

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (`.claude/agents/plan-reviewer.md`, spawned via the Agent tool and resumed for each
iteration, 2026-10-29)

| Iteration | Verdict | Summary |
|-----------|---------|---------|
| 1 | REVISE (4 ERROR, 7 WARN, 3 INFO) | E1: the alias broke the Tempo and Prometheus episode lookups. E2: `task-status.schema.json` is generated from Zod, and the test file was unnamed. E3: an unexecutable live-data open question. E4: the existing dashboard tests iterate every target. Plus Loki target type/queryType, the legacy KPI number, the post-merge check, counts, ADR status, the alias test and the allowlist test. |
| 2 | REVISE (1 ERROR, 2 WARN, 3 INFO) | E5: the Files Summary did not match the effort table. W8: the matrix named no test file and had no regeneration check. W9: the dropped-alias provenance was missing. I5: line-ending churn. |
| 3 | APPROVE (0 ERROR, 0 WARN, 1 INFO) | All fixes verified, and traceability is complete for AC-010 to AC-016 and D1 to D9. I7: the alias removal rests on the coordinator's relayed live check, recorded as relayed. |

E1 and E3 were resolved by new evidence rather than by the reviewer's two-way alias. The coordinator's live check
(2026-10-29) found only `ai-worker` and `api` in production, so spec D1 drops the alias, with a dated note.
