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
| ADR | `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md` | Accepted (row corrected 2026-10-29: the ADR itself says Accepted since 2026-10-22; amended 2026-10-29) | Created (amends ADR-001 lines 107, 413-429) |
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

---

## Addendum, 2026-10-29: new base, delivered detection rules, post-deploy KPI gate

**Base:** `agent/IFC-074-observability` = origin/main `9e378fbb0` (#1062) plus the 2026-10-22 IFC-074 commits, cherry-picked. The old branch `feat/ifc-074-ifc074` is kept. Everything above this line is the 2026-10-22 spec, and it still stands except where this addendum names a supersession.

**Session:**
- hydration re-run: `context/IFC-074/IFC-074-hydrated-context-2026-10-29.*`, hash `60942e28…b3ef`;
- five Explore subagents: exploration and Round 1 ANALYSIS;
- lead Round 2 draft: `context/IFC-074/round2-lead-draft-2026-10-29.md`;
- five role subagents: Round 3 CHALLENGE;
- lead resolutions: `context/IFC-074/round3-resolutions-2026-10-29.md`;
- Round 4 CONSENSUS by the same five agents: 5/5 APPROVED.

The full log is in `IFC-074-discussion.md`, section "2026-10-29 addendum".

### What changed since 2026-10-22
- **Delivered detection paths** (`infra/monitoring/grafana/cloud/alert-rules.json:74-101`):
  - the span rule `ifc074-error-spans-direct` (#1040);
  - the Loki rule `ifc074-error-logs-direct` (#1062, `datasourceUid: grafanacloud-logs`). It was applied to production on merge: workflow run 40846555065 logged "created ifc074-error-logs-direct".
- **Owner ruling 3** (`context/IFC-074/IFC-074-owner-ruling.md`): ship the code; the KPI is gated after deploy.
- **combined-worker runs `sha-9e378fbb0`.** Its monitor lines log `alertSeverity` and `driftSeverity` instead of a top-level `severity`.

**Implementation status (2026-10-29 exec, run `20261029-addendum`):**
- D1, D2, D5, D6, D7, D8 and D9 are implemented, in commits `b1ec09b6f`, `63a78bc1a`, `ea2a117b8`, `09efaeaef` and `4e0b81407`. D9 is tracked as F16.
- D3 needs no change.
- D4 is the path through the task KPI record.
- AC-013 stays NEEDS_HUMAN until the post-deploy measurement.

### Honest status of the numbers
- The `why` figures in both rules are modelled replays from the #1040 and #1062 PR bodies. They are **unverified here, and no evidence file is committed**:
  - span rule: 162-203 s;
  - Loki rule: 36-61 s for 9 of 13 episodes, with 0 false alarms.
- `mttr-baseline.json` and `correlation-test.csv` are still the 2026-10-22 run. They predate both rules and are not regenerated in this PR, because that needs a Grafana token.
- The Loki rule covers ai-worker only. api episodes are left to the span rule, which models above 120 s, so **api episodes are expected to miss** the target until F14 widens the Loki rule.

### Supersession of AC-004's statistic (owner ruling 4, 2026-10-29: Q1 answered B)
- **Old:** the mean over Normal/Pending→Alerting incidents per rule (AC-004, with the risk row "do not redefine the metric").
- **New (primary), pre-registered here before any post-deploy data:**
  - **episode:** a maximal run of error spans for one service, with no gap above the collector's episode gap constant (commit `7c85d4b2b`);
  - **episode MTTD:** seconds from the episode's first error span to the first Alerting transition of **any** repo rule for that service;
  - **KPI:** mean episode MTTD < 120 s.
- **Co-reported:** the per-incident mean (the old statistic).
- **Reason for the change:** one error episode raises several rule incidents (Grafana Asserts' ErrorRatioBreach alone fires 180-360 s after the first error), and "time until someone is alerted" is the first alert.
- **Impact:** the 2026-10-22 value (per-incident mean 268.7 s, n=63) is **not comparable** with the new statistic.
- The owner chose this (option B) on 2026-10-29 and confirmed that "10" means 10 real error **episodes** (ruling 4 in `context/IFC-074/IFC-074-owner-ruling.md`).

### Decisions
**D1, collector Loki routing**
- Each repo rule's kind is `DATASOURCE_KINDS[rule.datasourceUid ?? config.datasourceUid]`.
- Loki rules are evaluated through `lokiQueryRange`:
  - `step=60`, and the probe uses `start=end`;
  - the lookback is capped at 6 h and reported as `lookback_s`;
  - an empty matrix gives `first_true_s: null`.
- Transitions take `labels.service ?? labels.service_name`.
- ~~A constant alias `intelliflow-ai-worker` → `ai-worker`~~. **Dropped 2026-10-29 (plan review E1/E3):** the coordinator checked production live. The combined worker runs with `OTEL_SERVICE_NAME=ai-worker`, so its spans and logs are both `ai-worker`, and Tempo, span metrics and Loki show only `ai-worker` and `api`. `intelliflow-ai-worker` has no live series. An alias would only add risk: it would break the Tempo search (`earliestErrorSpan`) and the Prometheus matching for that name. Services are matched as they appear.
- Prometheus matching (`sameService`) is unchanged. The new Loki matcher gets its own name, because a local `sameService` at `:801` shadows it.
- An unknown uid gives `not_checked: "unknown_datasource"` and the run continues.
- `repo_rule_checks[]` gains `datasource_kind`. The output `schema_version` becomes **2.3.0** (it is already 2.2.0 at `:1191`).

**D2, proxy uid.** `datasourceProxy(uid)` throws `invalid datasource uid` (without echoing the value) unless the uid matches `^[A-Za-z0-9_-]{1,64}$`.

**D3, the Loki rule stays ai-worker only.** Failed procedures log at error, including client errors. Widening the rule is F14, after F11.

**D4, where the post-deploy MTTD lives (owner ruling 4, 2026-10-29: "Grafana panel + task KPI")**

Round 4 approved a dispatch-only workflow on a new Viewer token. The owner **superseded** it the same day. There is no new workflow, token or secret; the collector stays local, read-only and "never in CI", unchanged.

The traced pages show that neither app had an MTTD page:
- the tracker's views cover k6 load, delivery metrics, deploy health and AI cost, and its only "MTTR" is time to remediate vulnerabilities;
- the web app's "Data Incidents: 0 Reported" is a hard-coded string on the GDPR breach card (`apps/web/src/app/governance/compliance/page.tsx:313`).

The official KPI path:
1. After deploy, Aurora runs the collector locally (≥10 real error episodes, per-episode statistic, per-incident mean co-reported). It writes `artifacts/reports/mttr-baseline.json`.
2. That result goes into `.specify/sprints/sprint-18/attestations/IFC-074/task-tracking.json` `kpis.mttd_target`, with the file's SHA-256 as `source` and an append-only `status_history`.
3. It then goes into attestation `kpi_results`.
4. `pnpm generate:metrics` regenerates the cache, and the tracker's task modal shows it (`/api/tasks/validation-summary/IFC-074`).

**D7, task-status schema defect (fixed in this PR).** `apps/project-tracker/docs/metrics/schemas/task-status.schema.json` KPI objects are `additionalProperties: false` and need a boolean `met`.
- Today's `task-tracking.json` carries `source` on both KPIs and `met: null` on `traces_correlating`, so the generated cache fails its own schema.
- The fix: add an optional string `source` to the KPI object schema. The JSON is generated: the change goes into Zod `kpiEntrySchema` in `tools/scripts/lib/schemas/task-status.schema.ts:144`, followed by `pnpm generate:schemas`. Also set `traces_correlating.met: false`, meaning "not demonstrated" (dated note, append-only history).

**D8, Grafana panel "MTTD per error episode (live proxy)"** on the ENV-008 dashboard `infra/monitoring/grafana/cloud/dashboard-production.json` (uid `env008-production`), applied on merge by `grafana-dashboard.yml`.
- Grafana cannot join error signals with alert transitions per episode inside a panel. The panel is therefore an **honest live proxy**, titled and described as one: per minute, it shows the error signals next to the alert firings, so the gap between them is the detection delay. The description names the committed collector result (`artifacts/reports/mttr-baseline.json` and the task KPI) as the official MTTD.
- Targets:
  - (A) error spans per minute by service, from Prometheus span metrics;
  - (B) error-level log lines per minute from Loki, with the same filter as `ifc074-error-logs-direct`;
  - (C) Alerting transitions per minute by rule, from the alert state history (Loki datasource `grafanacloud-alert-state-history`, `{from="state-history"} | json`, the same source the collector reads).
- `apply-grafana-dashboard.mjs` `validateConfig` learns per-target datasources:
  - Prometheus targets keep today's metric and service checks;
  - a Loki target must name `grafanacloud-logs` or `grafanacloud-alert-state-history` and may only select `service_name="ai-worker"` or the state-history stream;
  - any other datasource uid is rejected.

**D9, follow-up only, not in this PR** (debt ledger): refresh `artifacts/reports/*/dora-metrics.json` from real data now that deploy events exist (the promotion ledger), including incidents and time-to-restore with MTTD.

**D5, api log keys**
- Both `tenantId` and `userId` stay, as in the 2026-10-22 spec line "added by the mixin".
- Only protected and tenant procedures carry them. Public, admin, partner and auth procedures carry neither (`trpc.ts:102,251,271,316,348,575,598`).
- This is recorded in an ADR-086 amendment: purpose, owner-only access, and Loki retention.
- Any later minimisation of userId is done once, for every service, in both the mixin and the spans.

**D6, api runtime impact** (stated in the PR body and ADR-086)
- api log records are written only inside tRPC calls (`middleware.ts:165-222`), 1-2 lines per request.
- The logs batch timer starts only while records are buffered, and it is unref'd (`@opentelemetry/sdk-logs` 0.219.0 `BatchLogRecordProcessorBase.js:228-257`). Logging therefore creates no idle outbound traffic.
- The 60 s metrics reader, traces and health probes are pre-existing and separate.
- Bytes per line are an estimate unless measured from the real-pino test.
- A volume tripwire is F15.

### New acceptance criteria
- **AC-010** (pre-merge)
  - The collector routes `ifc074-error-logs-direct` only to `/api/datasources/proxy/uid/grafanacloud-logs/loki/api/v1/query_range`, never to a Prometheus path.
  - Tests use a fake that is strict per datasource uid, and assert the `grafana.calls` paths, the decoded `query`, and `step=60`.
  - Prometheus rules still go to the prom proxy.
  - An unknown uid gives `not_checked`, and the run exits 0.
- **AC-011** (pre-merge)
  - A Loki-rule Alerting transition labelled only `service_name="ai-worker"` anchors to an episode whose span service is `ai-worker`. A span-rule episode stays anchored exactly as before (regression). The alias was dropped, see D1.
  - A Loki series without `service_name` matches only an episode without a service.
  - `datasourceProxy` rejects `../x`, `a/b`, `a?b`, `''` and a 65-character uid.
  - `schema_version` is `2.3.0`, and `datasource_kind` is allowlisted (and in the `.d.mts`).
- **AC-012** (pre-merge, replaces the dispatch-workflow AC per ruling 4)
  - `task-status.schema.json` accepts an optional string `source` on a KPI object and still rejects any other extra key and a non-boolean `met` (schema test).
  - `task-tracking.json` IFC-074 validates against it with `traces_correlating.met: false`.
  - `pnpm generate:metrics` regenerates `apps/project-tracker/docs/metrics/sprint-18/IFC-074.json` with the collector's `mttd_target` (no `actual: null`), and **its `kpis` subtree** validates, with 0 KPI errors under both the JSON schema (Ajv) and `validate-schemas.ts` (Zod).
  - **Narrowed 2026-10-29 during exec:** the AC does not claim the whole cache validates.
    - The JSON schema is not met by 277 of 428 generated task caches. Only 30 of those 277 fail on KPIs; the rest fail on `artifacts.created` shape, `validations` keys, `status_history` statuses and similar.
    - `validate-schemas.ts` already fails at base, on 252 files.
    - IFC-074's own cache still fails on three `status_history` statuses written on 2026-10-22. That history is append-only, so they are not rewritten.
    - These are tracked as F17. F18 tracks a related drift: the committed generated schemas no longer match what `generate:schemas` emits after the Zod upgrade. That is why this PR adds only the generator's exact `source` fragment to `task-status.schema.json` and does not regenerate. The coordinator approved this.
  - No workflow, token or secret is added.
- **AC-013** (NEEDS_HUMAN, post-deploy)
  - The pre-registered episode MTTD is judged only over at least 72 h or at least 10 real error episodes, counted from the later of the api and combined-worker promotions.
  - The evidence is the committed `mttr-baseline.json` from Aurora's local collector run. Its SHA-256 is recorded as `kpis.mttd_target.source` and in the attestation.
  - The per-incident mean is co-reported.
- **AC-016** (pre-merge; the live check after the merge applies)
  - `dashboard-production.json` has a panel titled with "live proxy". It has targets A (prom error spans), B (Loki error-level lines, the same filter as the rule) and C (state-history Alerting transitions). Its description names `artifacts/reports/mttr-baseline.json` and the IFC-074 task KPI as the official MTTD.
  - `validateConfig` accepts it, and rejects:
    - a Loki target on an unknown datasource uid;
    - a Loki selector other than `service_name="ai-worker"` or `{from="state-history"}`;
    - a Prometheus target that breaks today's checks.
  - The tests follow the existing panel tests in `tools/scripts/__tests__/apply-grafana-dashboard.test.ts`.
  - After merge, `grafana-dashboard.yml` reports `updated dashboard env008-production`.
- **AC-014** (pre-merge) This addendum, ADR-086's amendment and the PR body state:
  - the supersession;
  - that the 2026-10-22 value is not comparable;
  - the unverified-model labels;
  - the expected api miss;
  - the runtime-impact wording.
- **AC-015** (pre-merge) A real-pino test under `runWithLogContext` asserts the exact key set of an emitted `trpc.request` record:
  - with a protected context, it includes `tenantId` and `userId`;
  - with no context, it includes neither.

AC-002, AC-009 and task-tracking blockers 4 and 5 stay open. Ruling 3 answers only the tuning half of blocker 6.

**Attestation `kpi_results` (planned wording)**
- MTTD `target`: "< 120 s mean per-episode first alert".
- `actual`: "NOT MEASURED on the post-#1040/#1062 stack. Last measurement 2026-10-22 (per-incident mean 268.7 s, n=63, not met) predates both rules. Post-deploy per-episode measurement pending (>=72 h or >=10 episodes)."
- `met: false`, meaning "not demonstrated".
- Verdict: `NEEDS_HUMAN`.

### Post-deploy runbook (owner)
1. Merge the PR.
2. `build-images` produces `sha-<merge>`.
3. Dispatch `promote-production` with `api`, on the owner's yes.
4. The uptime check passes, and `OTEL_EXPORTER_OTLP_ENDPOINT` is set on the api.
5. Make one real tRPC call.
6. Watch the "MTTD per error episode (live proxy)" panel as errors happen.
7. Aurora runs `collect-observability-evidence.mjs` locally with `--since <deploy>`, read-only, and commits `mttr-baseline.json` and `correlation-test.csv`.
8. Update `task-tracking.json` `kpis.mttd_target` (with the SHA-256 `source`), then attestation `kpi_results`, then run `pnpm generate:metrics`.
9. Repeat until at least 72 h or 10 real error episodes, then judge AC-013 and AC-002.

Public, admin, partner and auth procedure records carry no tenantId, so Loki queries by tenant will not find them.

### New findings (gh issue, debt-ledger and findings doc)
- **F14:** widen `ifc074-error-logs-direct` to the api after F11.
- **F15:** there is no Loki volume tripwire, so a free-tier overrun would drop ingestion silently.
- **F17:** generated task caches against `task-status.schema.json`: 277 of 428 fail it, and `validate-schemas.ts` fails at base.
- **F18:** the committed generated schemas have drifted from what `pnpm generate:schemas` now emits (Zod 4.6.7); they need a dedicated regeneration PR.
- **F16 (D9):** `artifacts/reports/*/dora-metrics.json` is not fed from real data. Refresh it from the promotion ledger (deploys), incidents, and time-to-restore with MTTD.

### Agent sign-offs (2026-10-29)

| Agent | Vote | Conditions folded in |
|-------|------|----------------------|
| Backend-Architect | APPROVED | alias in transition normalisation, plus an `intelliflow-ai-worker` episode test; regex-only uid check; `lookback_s` on every Loki check |
| DevOps-Lead | APPROVED | the Viewer token needs the owner; ENV008-PROD-ENV-BRANCH-POLICY-001 stays open; the api promotion is the owner's |
| Security-Lead | APPROVED (blocking condition folded in) | the collector accepts `GRAFANA_VIEWER_TOKEN`, so the workflow never names `GRAFANA_SA_TOKEN`; the runbook notes which procedures carry no tenantId |
| Test-Engineer | APPROVED (blocking condition folded in) | `schema_version` 2.3.0 pinned by a test; a `service_name`-aware `seriesService`; a Loki matcher name distinct from the local at `:801`; tests for `not_checked` and `unknown_datasource`; alias and fallback mutations |
| Domain-Expert | APPROVED | assumptions labelled pending owner; AC-013, AC-014 and AC-015 text included; the per-episode computation and the schema bump in one commit; the alias checked against `LOG_RULE_SERVICES` (`:836`) |

Approval: 5/5 (100%), above the 66% threshold, in the first CONSENSUS round, with no unresolved critical issue.

**After consensus (2026-10-29), owner ruling 4:**
- Q1 is answered B, as assumed.
- Q2 supersedes the consensus's D4 and AC-012, so there is no dispatch workflow or Viewer token, and the conditions the consensus attached to D4 are moot.
- D7, D8, D9, AC-016 and the new AC-012 were added on the owner's instruction, not voted. They are reviewed by the plan-reviewer subagent in plan-session.
