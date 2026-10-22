# Specification: IFC-074 — PHASE-040: Full Stack Observability

**Status:** APPROVED — `/spec-consensus` 5/5 APPROVED in 1 consensus round (2026-10-22; see Agent Sign-offs)
· **Sprint:** 18 · **Branch:** `feat/ifc-074-ifc074` · **Base:** origin/main `e7ce625b2` · **Owner (row):** SRE Lead +
DevOps (STOA-Automation) · **STOA:** automation (row) + foundation + security (logging change, read-only production
access, committed evidence)

## Overview

IFC-074 promises that traces, metrics and logs are unified with context, with three artifacts
(`sentry-project-config.json`, `correlation-test.csv`, `mttr-baseline.json`) and the KPIs "MTTD < 2 min, root cause
identifiable". The row was reopened on 2026-10-05 because its evidence was fabricated: the correlation CSV holds
hand-written, non-hex trace IDs; the MTTR baseline describes "simulated incidents"; the Sentry config is a placeholder
template. Its close rule (`.specify/sprints/sprint-1/attestations/IFC-074/task-tracking.json` blocker 4) requires
production evidence: real trace IDs that correlate in the hosted backend, and an MTTD measured from a real alert.

Verified read-only against Grafana Cloud on 2026-10-22 (lead):
- Loki `service_name` values over 7 days: `["ai-worker"]` only — **the api sends no logs**. ai-worker has 44 lines with a
  `trace_id` in 7 days.
- Tempo `resource.service.name` values: `api`, `ai-worker`.
- Alert state history (30 d): Normal→Alerting for `ErrorRatioBreach` ×209 (Grafana-managed rule, real ai-worker span
  errors), `LatencyP95Breach` ×2, `LatencyP95Anomaly` ×1, `asserts_up` ×3, IFC-032 delivery test ×1.
- Root cause of the api gap: `apps/api/src/tracing/middleware.ts:153-213` logs with `console.*`; only pino records are
  forwarded to the OTel Logs SDK (`packages/observability/src/node-instrumentations.ts:34-36`).

### Owner ruling (binding, 2026-10-22)

`.specify/sprints/sprint-18/context/IFC-074/IFC-074-owner-ruling.md` — option **A**: route api request logs through pino
to Loki; add a read-only Grafana collector that writes both evidence files from real data; ai-worker rows and MTTD are
real now; the api row is NEEDS_HUMAN until merge + deploy, then a collector re-run closes it. **The Sprint_plan row stays
In Progress until that post-deploy re-run.**

## Related Documents

| Type | Path | Status | Action |
|------|------|--------|--------|
| PRD | N/A | — | Backend/infra remediation; no user-facing feature |
| ADR | `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md` | Proposed | Created (amends ADR-001 lines 107, 413-429) |
| ADR | `docs/architecture/adr/ADR-001-modern-stack.md` | Accepted | Referenced |
| ADR | `docs/architecture/adr/ADR-017-workflow-reliability.md` | Accepted | Referenced (real-trace evidence rule) |
| Ruling | `.specify/sprints/sprint-18/context/IFC-074/IFC-074-owner-ruling.md` | Binding | Referenced |

## Dependency Verification (Phase 0.95)

| Dependency | Claim | Verified | Method |
|-----------|-------|----------|--------|
| IFC-003 | tRPC router setup (`trpc.ts`, router) | TRUE | `apps/api/src/trpc.ts:14,39,75` (`initTRPC`, `createTRPCRouter`); `router.ts` merges 146 router refs |
| IFC-003 | Type-safe endpoints / subscriptions artifacts | TRUE | `apps/api/src/shared/e2e-type-safety-test.ts`, `subscription-demo.ts` exist |
| IFC-032 (close-rule precondition) | Alert delivery proven in production | TRUE | `.specify/sprints/sprint-18/attestations/IFC-032/attestation.json` verdict COMPLETE; real ai-worker trace + received test alert |

## Technical Approach

### Part 1 — api logs through pino
- NEW `apps/api/src/tracing/logger.ts`: `getApiLogger(): Logger` — lazy singleton
  `createLogger({ name: process.env.OTEL_SERVICE_NAME?.trim() || 'intelliflow-api' })`; `resetApiLoggerForTests()`.
  Never created at module load (instrumentation-pino patches `pino()` at call time —
  `instrumentation-pino/build/src/instrumentation.js:29-79`; first call happens during a request, after
  `apps/api/src/instrument.ts:11-13` has started the SDK).
- MODIFY `apps/api/src/tracing/middleware.ts` `tracingMiddleware`: replace the three `console.*` calls with pino calls
  emitted **before** `span.end()`:
  - success `info({ type:'trpc.request', correlationId, path, method, durationMs, status:'success' }, 'trpc request')`
  - slow (> 50 ms) `warn({ type:'trpc.slow', correlationId, path, method, durationMs, targetMs:50 }, 'slow trpc request')`
  - failure `error({ type:'trpc.error', correlationId, path, method, durationMs, status:'error', code, errorName },
    'trpc error')` — every failure stays at `error` (same as today's `console.error`).
  - `path` must match `^[A-Za-z0-9_.]{1,120}$`, else `'invalid'`. `errorName` must match `^[A-Za-z][A-Za-z0-9_]{0,60}$`,
    else `'Error'`. Never `error.message`, `stack`, `cause`, `requestId`, email or input.
- MODIFY `packages/observability/src/logging.ts` `createLogger`: pino `redact`
  `{ paths: ['email','*.email','userEmail','password','*.password','token','*.token','accessToken','refreshToken',
  'apiKey','*.apiKey','api_key','secret','*.secret','authorization','*.authorization','cookie','*.cookie',
  'req.headers.authorization','req.headers.cookie'], censor: '[REDACTED]' }`. Only `createLogger` consumers are
  affected (no other workspace imports it; ai-worker builds its own `pino()`).
- `apps/api/src/test/setup.ts`: global `vi.mock('../tracing/logger')` (hoisted spy object, plain-arrow `getApiLogger`, so
  `mockReset` cannot wipe it) and `trace.getActiveSpan: () => undefined` on the global `@opentelemetry/api` mock.
- `metricsMiddleware`, `correlation.ts logWithCorrelation` and the rest of the api's console logging are untouched (L1).

### Part 2 — read-only evidence collector
- NEW `tools/scripts/observability/collect-observability-evidence.mjs` + `.d.mts`, exported
  `run({ env, argv, fetchImpl, log, now, sleep, writeFile, rename, unlink })` returning an exit code (0 | 1 | 2). Main
  guard is the only unexported code (pattern: `apply-grafana-alert-rules.mjs:170-175`).
- `tools/scripts/lib/grafana-provisioning.mjs`: add `lokiQueryRange`, `tempoSearch`, `tempoTrace`, `promInstantQuery`,
  `withRetry`, `grafanaHealth`; reuse `createApiClient` (GET only — any other method throws).
- Env: `GRAFANA_URL`, `GRAFANA_SA_TOKEN` (env only; missing → exit 1, nothing written). Token only in the Authorization
  header. Errors print `HTTP <status> <endpoint-name>` — no body, no URL, no token.
- Retry 429/502/503/504 ×5 (5/10/20/40/60 s, honour `Retry-After`), sequential; other non-2xx fail fast. A 503 is never
  "no data". Warm-up: Grafana `/api/health` through the same client.
- CLI: `--services api,ai-worker` (Tempo/Loki resource service names) `--log-window-days 7 --alert-window-days 30
  --max-traces 10 --since <ISO> --out-dir artifacts/reports --dry-run`.
- **Correlation** per service:
  1. Loki `query_range` `{service_name="<svc>"} | trace_id!=""` (structured metadata; never `| json`), window from
     `--since`/`--log-window-days`, `direction=backward`, limit `--max-traces`.
  2. Tempo `/api/traces/<trace_id>` → `trace_found`, `span_found` (log span_id present), `service_match`, span name.
  3. Prometheus instant query at `time=log_ts`:
     `count(count_over_time(traces_spanmetrics_calls_total{service="<svc>",span_name="<span name>"}[5m]))` > 0 →
     `metric_series`.
  4. `status=PASS`, `passed=true` only when all four hold; otherwise `FAIL`. No lines → one row `NOT_OBSERVED`,
     `passed=false`.
- **MTTD**:
  - Alert history (`{from="state-history"} | json | current=~"Alerting.*"`) in 7-day slices over
    `--alert-window-days`; `previous` (Normal or Pending) from the parsed line; rule `for`/interval via GET
    `/api/v1/provisioning/alert-rules`.
  - Exclusions declared up front, counted and listed with constant reasons: IFC-032 delivery-test rule, `asserts_up`
    (telemetry absence, not error detection), unanchored incidents.
  - Incident = run of transitions per (ruleUID, service) split by a ≥ 30 min gap; raw transition count also reported.
  - `t_alerting` = first transition of the incident; `t_first_error` = min `startTimeUnixNano` over error spans from
    Tempo search `{resource.service.name="<svc>" && status=error}` `limit=50` in [t_alerting − 30 min, t_alerting]
    (bounded by the previous incident's end; window narrowed while 50 traces return). Trace IDs left-padded to 32 hex.
  - `mttd_s = t_alerting − t_first_error`; no error span or negative value (clock skew) → `anchored=false`.
  - Each anchored incident records `first_error_trace_id`, `first_error_span_name`, `first_error_service`,
    `trace_resolves`, `pending_s` (when found), `auto_resolve_s` (Alerting→Normal, labelled auto-resolve).
  - Aggregates: `n_transitions, n_incidents, n_anchored, n_unanchored, mean_s, median_s, p90_s, share_lt_120s`.
    KPI statistic = **mean**; `met = mean_s < 120`; zero anchored → `met = null`; `cause_if_not_met` from constants
    (rule pending period / evaluation interval / sampling).
- **Output hygiene (fail closed before writing)**: per-column allowlist — service `^[a-z0-9-]{1,40}$`; trace
  `^[0-9a-f]{32}$`; span `^[0-9a-f]{16}$`; timestamps `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?Z$`; numbers
  `^\d{1,12}(\.\d{1,3})?$`; booleans; status enum; rule uid `^[A-Za-z0-9_-]{1,64}$`; alertname
  `^[A-Za-z][A-Za-z0-9_:]{0,63}$` (title only for rule uids committed in the repo); span names
  `^[A-Za-z0-9_.:/ -]{1,80}$` and replaced by `"redacted"` if they look like a hostname
  (`[a-z0-9-]+\.[a-z0-9-]+\.[a-z]{2,}`), contain a UUID, an ≥ 8-char hex run or a ≥ 6-digit segment. Free labels
  (`asserts_*`, request context) are dropped before validation. No column/key name containing key/token/auth/secret/api.
  All free-text JSON fields come from collector constants. CSV fully quoted (no logfmt). No stack URL, datasource UID,
  hostnames, tenant/user ids, raw lines or response bodies.
- Writes `artifacts/reports/correlation-test.csv` and `artifacts/reports/mttr-baseline.json` atomically (temp + rename,
  after both validate; temp files removed on failure) and prints the SHA-256 of each. Exit 2 when written but ai-worker
  has zero PASS rows or zero anchored incidents (ADR-017 "block on missing traces").
- CSV columns: `test_id,service,trace_id,span_id,log_ts,span_name,trace_found,span_found,service_match,metric_series,
  status,passed,query_window_start,query_window_end,collected_at`.
- `mttr-baseline.json` keys: `schema_version, task_id, generated_at, measurement_method:
  "grafana-cloud-readonly-collector", windows, rules[], incidents[], exclusions[], aggregates, kpi, limitations[]`.
- Runs locally only (never in CI). Admin SA token used read-only for now (Viewer token = finding F7).

### Part 3 — truthful artifacts and docs
- REWRITE `infra/monitoring/sentry-project-config.json`: describes real wiring only — api initialises Sentry
  (`apps/api/src/tracing/sentry.ts`), web initialises Sentry (`apps/web/src/lib/sentry/init.ts`), ai-worker has
  `SENTRY_DSN` provisioned but no SDK init (finding F10); DSN source = env `SENTRY_DSN` managed by Terraform
  `railway_variable.observability` (IFC-314, 2026-06-08); environment = `SENTRY_ENVIRONMENT`; traces sample rate default
  0.1 (`sentry.ts:130`); disabled in development (`sentry.ts:126`); project existence in Sentry = NEEDS_HUMAN (org token
  lacks project read). No DSN value, hosts, invented integrations, contacts or keys.
- `docs/observability/IFC-074-IMPLEMENTATION.md`: status line (`:5`) and unbacked `[x]` claims (`:482-484`) corrected.
- `docs/operations/incident-runbook.md:22-23,408`: alert delivery proven (IFC-032); detection proven for ai-worker; add the
  post-deploy evidence step (one real tRPC call, then re-run the collector with `--since`).
- `docs/architecture/diagrams/complete-dependency-chains.md`: add IFC-074 to the Observability Stack chain.
- `.specify/sprints/sprint-1/attestations/IFC-074/task-tracking.json`: fabricated KPI values → `actual: null, met: null`
  (keys kept), fabricated `completed_at`/`execution` values nulled or annotated, `status_history` append-only; blockers 2
  and 3 resolved only when the collector outputs replace the fabricated files; the close-rule blocker stays open until
  AC-002 passes.

## Components

| Component | Layer | Action |
|-----------|-------|--------|
| `apps/api/src/tracing/logger.ts` | api / observability adapter | NEW |
| `apps/api/src/tracing/middleware.ts` | api / tRPC middleware | MODIFY (3 log calls) |
| `packages/observability/src/logging.ts` | shared package | MODIFY (`redact`) |
| `apps/api/src/test/setup.ts` | test infra | MODIFY (logger mock, `getActiveSpan`) |
| `tools/scripts/lib/grafana-provisioning.mjs` | tooling lib | MODIFY (read helpers) |
| `tools/scripts/observability/collect-observability-evidence.mjs` (+ `.d.mts`) | tooling | NEW |
| `artifacts/reports/correlation-test.csv`, `artifacts/reports/mttr-baseline.json` | evidence | REGENERATED by collector |
| `infra/monitoring/sentry-project-config.json` | config description | REWRITE |
| ADR-086, IFC-074-IMPLEMENTATION.md, incident-runbook.md, complete-dependency-chains.md | docs | CREATE / EDIT |

## Interfaces & Contracts

```ts
// apps/api/src/tracing/logger.ts
export function getApiLogger(): Logger;          // pino Logger from @intelliflow/observability createLogger
export function resetApiLoggerForTests(): void;

// tools/scripts/observability/collect-observability-evidence.mjs
export async function run(opts?: {
  env?: Record<string, string | undefined>; argv?: string[]; fetchImpl?: typeof fetch;
  log?: (msg: string) => void; now?: () => Date; sleep?: (ms: number) => Promise<void>;
  writeFile?: (p: string, data: string) => Promise<void>; rename?: (a: string, b: string) => Promise<void>;
  unlink?: (p: string) => Promise<void>;
}): Promise<0 | 1 | 2>;
```

Log records (Loki body attributes; `trace_id`, `span_id`, `tenantId`, `userId` added by the mixin/instrumentation):
`{type:'trpc.request', correlationId, path, method, durationMs, status:'success'}` ·
`{type:'trpc.slow', correlationId, path, method, durationMs, targetMs:50}` ·
`{type:'trpc.error', correlationId, path, method, durationMs, status:'error', code, errorName}`.

## Integration Points

- Production path: `node dist/main.js` → `./instrument` (SDK start, pino instrumentation registered) → `http-server` →
  router → any procedure → `tracingMiddleware` → `getApiLogger()` → pino → instrumentation-pino OTLP log stream →
  Grafana Cloud OTLP gateway → Loki (`service_name` = OTel resource `service.name`).
- Collector → Grafana Cloud datasource proxy (`grafanacloud-logs`, `grafanacloud-traces`, `grafanacloud-prom`,
  `grafanacloud-alert-state-history`) + provisioning API, GET only.

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---------|-------------------|-------------------|-------|
| `getApiLogger()` | `tracingMiddleware` (every tRPC procedure builder, `trpc.ts:98,244-249,263-269,312,344,567-571,594`) | `console.log` trpc.request (`middleware.ts:161`), `console.warn` SLOW REQUEST (`:154`), `console.error` trpc.error (`:202`) | Console calls removed, not duplicated |
| `createLogger` redact | `getApiLogger()` | — | Hardens the new OTLP export |
| `collect-observability-evidence.mjs run()` | Operator/agent, locally (now and post-deploy) | Hand-written `correlation-test.csv`, simulated `mttr-baseline.json` | Not in CI |

## Navigation & Reachability (UI tasks)

N/A — no page, route or UI change.

## Acceptance Criteria

- **AC-001** (pre-merge) ai-worker correlation: collector output has ≥ 1 `PASS` row for `ai-worker` — 32-hex trace id
  found in Tempo, log span id present in that trace, service matches, span-metrics series present at `log_ts`.
- **AC-002** (NEEDS_HUMAN, post-deploy) api correlation: the same for `api`. Preconditions: Railway api has
  `OTEL_EXPORTER_OTLP_ENDPOINT` set, `OTEL_LOGS_EXPORTER` unset or `otlp`, `LOG_LEVEL` ≤ info, `NODE_ENV=production`;
  ≥ 1 real tRPC call after deploy; collector re-run with `--since <deployTs>`. Until then the api row is `NOT_OBSERVED`.
- **AC-003** (pre-merge) api request records go through pino and carry `trace_id`/`span_id` of the active span; no
  `console.log` for trpc.request; error record has `code` + sanitised `errorName` and no message/stack/cause/requestId;
  importing `logger.ts` does not create a logger.
- **AC-004** (pre-merge) MTTD measured from real Normal/Pending→Alerting transitions by the collector
  (`measurement_method: grafana-cloud-readonly-collector`), with n, mean (KPI), median, p90, share < 120 s, exclusions;
  `met` reported as measured (true/false/null), never asserted.
- **AC-005** (pre-merge for ai-worker; api post-deploy) root cause identifiable: every anchored incident names the rule,
  the first error trace id (resolving in Tempo) and the first failing operation (`first_error_span_name`).
- **AC-006** (pre-merge) `sentry-project-config.json` contains no placeholder DSN, `example.com`, `placeholder`, invented
  host or credential-shaped value, and describes the real wiring.
- **AC-007** (pre-merge) fabricated KPI/attestation entries removed or nulled in task-tracking.json; new attestation
  built by `/exec-attestation` with real exit codes and SHA-256 hashes.
- **AC-008** (pre-merge) ADR-086 created and indexed; IFC-074-IMPLEMENTATION.md, incident-runbook.md and the dependency
  chain corrected.
- **AC-009** (gate) Sprint_plan row stays In Progress until AC-002 passes (owner ruling).

### Non-functional
- **NF-001** Committed evidence passes `gitleaks dir <file> --config .gitleaks.toml` and a
  `grafana.net|supabase|pooler|@` grep with zero hits; no new `.gitleaks.toml` allowlist entry.
- **NF-002** Collector makes GET requests only; token never appears in logs, errors or written bytes.
- **NF-003** No per-request overhead beyond one pino call (existing p95 tracing-overhead test in `tracing.test.ts` stays
  green).
- **NF-004** Diff-coverage ≥ 80 % on changed lines (`middleware.ts`, `logger.ts`, `grafana-provisioning.mjs`, collector);
  only the collector main guard uncovered.

## Test Requirements

New / extended tests (TDD, RED first):
- `packages/observability/src/logging.test.ts`: real `createLogger` record (in-memory destination via
  `vi.spyOn(pino,'destination')`, `CI=1`, `NODE_ENV=production`) carries the active span's `trace_id`/`span_id` and omits
  them outside a span; `it.each` over every redact path (top-level + nested) → `[REDACTED]`.
- `packages/observability/src/pino-otlp.test.ts` (new): with `PinoInstrumentation` registered and an in-memory log
  exporter (`@opentelemetry/sdk-logs`), a logger created after registration exports a record whose trace/span ids equal
  the active span's (guards the lazy-creation + `__toESM` interop). `@opentelemetry/instrumentation-pino` and
  `@opentelemetry/sdk-logs` added as exact-pinned devDependencies of packages/observability.
- `apps/api/src/tracing/logger.test.ts` (new, `vi.unmock('./logger')`, `createLogger` mocked): lazy (import does not
  create), singleton, name from `OTEL_SERVICE_NAME`, whitespace → default, reset helper.
- `apps/api/src/tracing/middleware.test.ts`: info success record; warn slow record (`vi.useFakeTimers({toFake:['Date']})`);
  error record with code + errorName, no message; `errorName` fallback (`'x y<>'`, newline, > 61 chars); invalid path →
  `'invalid'`; logged before `span.end`; no `console.log` for trpc.request.
- `apps/api/src/__tests__/trpc.test.ts:189,206`: switched to logger spies.
- `tools/scripts/lib/grafana-provisioning.test.ts`: direct tests for each new helper (GET-only assert, retry/backoff with
  injected sleep, Retry-After, exhaustion, non-retryable failure, no body/URL in errors).
- `tools/scripts/__tests__/collect-observability-evidence.test.ts` (new): env missing → 1, nothing written; GET only;
  correlation PASS / FAIL (trace missing, span missing, metric absent) / NOT_OBSERVED; trace id left-padding; MTTD
  incidents (gap split edge, Pending previous, exclusions, unanchored, negative → unanchored, zero anchored → met null,
  mean vs median); 7-day slicing; 503 retry; non-2xx; exit codes 0/1/2 via return value; allowlist fail-closed for
  hostname / UUID / email / raw line / quote+newline (nothing written, temps removed); span-name redaction cases;
  free-text from constants; sentinel token absent from logs, errors, bytes and echoed bodies; dry-run writes nothing;
  SHA-256 printed.

Regression suites (Node 22.14.0, `pnpm --filter @intelliflow/observability build` first):
`pnpm --filter @intelliflow/observability test` · `pnpm --filter @intelliflow/api test` (every router uses the
middleware) · root project `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`,
`apply-synthetic-monitoring.test.ts`, `tools/scripts/lib/grafana-provisioning.test.ts` · `pnpm test:coverage` +
diff-coverage.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Logger created before SDK start → unpatched, no OTLP logs | Lazy creation + import-time test + OTLP interop test |
| Real mixin throws in api tests (`getActiveSpan` missing from mocks) | Global logger mock + `getActiveSpan` in setup.ts |
| PII / credentials in Loki | Fixed record shape, no message/requestId, sanitised path/errorName, pino `redact` |
| Hostnames / ids leak into committed evidence | Allowlist fail-closed, label drop, span-name redaction, gitleaks + grep acceptance |
| Grafana free-tier stack asleep (503) | Retry with backoff + warm-up; 503 never treated as no data |
| api row never observed after deploy (no tRPC traffic) | Documented post-deploy step: one real tRPC call, then `--since` re-run (owner) |
| Mean MTTD > 120 s because of rule pending periods | Report `met:false` with constant cause; do not redefine the metric |
| Admin token in an operator shell | Env-only, GET-only assert, unset after use; Viewer token follow-up (F7) |
| Last log batch lost on SIGTERM | Pre-existing race (F9); AC-002 judged on steady traffic |

## Out of scope — tracked findings (gh issue + `artifacts/metrics/debt-ledger.yaml` + findings doc)

F1 `logContextMiddleware` reads unset `ctx.correlationId` (trpc.ts:107-116) · F2 `redactSensitiveData` `apiKey` case bug
(logging.ts:494-517) · F3 `hostname` in pino bindings (logging.ts:89-94) · F4 dead `metricsMiddleware`
(middleware.ts:229-264) · F5 `OTEL_SERVICE_NAME` drift (Railway "api" vs Terraform unset / code default) · F6
`alert-rules.json` stale `_comment` path · F7 collector should use a Viewer SA token · F8 `base.environment` reads unset
`ENVIRONMENT` → "development" in production (logging.ts:66-69; high) · F9 SIGTERM race: main.ts exits before OTel flush
(main.ts:26-32 vs otel.ts) · F10 ai-worker `SENTRY_DSN` provisioned, SDK never initialised · F11 TRPC client-code
log-level split · F12 ai-worker pino lines unredacted · F13 admin procedures skip `logContextMiddleware`
(trpc.ts:312,567-571).

## Agent Sign-offs

Exploration (Phase 0.75, Explore subagents, all used Read/Grep/Glob with file:line citations) → Round 1 ANALYSIS →
Round 2 PROPOSAL → Round 3 CHALLENGE → Round 4 CONSENSUS, all on 2026-10-22. Full log:
`.specify/sprints/sprint-18/specifications/IFC-074-discussion.md`.

| Agent | Verdict | Files verified (abridged) | Conditions folded into this spec |
|-------|---------|---------------------------|----------------------------------|
| Backend-Architect | APPROVED | middleware.ts, trpc.ts, main.ts, instrument.ts, otel.ts, setup.ts, logging.ts, instrumentation-pino build, sdk-node build | OTLP interop test required; F9 wording |
| DevOps-Lead | APPROVED | otel.ts (api, ai-worker), grafana-provisioning.mjs, apply-grafana-alert-rules.mjs, monitoring/main.tf, alert-rules.json, sentry-project-config.json | `count(count_over_time(...))`; warm-up hits Grafana `/api/health` |
| Security-Lead | APPROVED | logging.ts, log-context.ts, correlation.ts, middleware.ts, .gitleaks.toml, .gitleaks/shared.toml, .husky/pre-commit, gdpr-compliance.md | Span-name redaction for UUID / hex run / digit segment + negative tests |
| Test-Engineer | APPROVED | middleware.test.ts, trpc.test.ts, setup.ts, user-membership.procedures.test.ts, logging.test.ts, vitest.config.ts, sonar-project.properties | Exact-pinned devDeps for instrumentation-pino + sdk-logs; exit codes via `run()` return |
| Domain-Expert | APPROVED | task-tracking.json, attestation.json, owner ruling, ADR-017, constitution.md, alert-rules.json | Null the fabricated `execution` block; F8 ranked high |

Approval: 5/5 (100 %) ≥ 66 % threshold; no unresolved critical issue.
