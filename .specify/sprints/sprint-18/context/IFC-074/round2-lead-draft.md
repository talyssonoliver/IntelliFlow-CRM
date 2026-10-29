# IFC-074 — Round 2 lead draft (synthesised from Round 1)

Owner ruling A (2026-10-22). Row stays In Progress until a post-deploy collector re-run.

## Part 1 — api logs through pino (code)
- NEW `apps/api/src/tracing/logger.ts`: lazy `getApiLogger()` = `createLogger({ name: process.env.OTEL_SERVICE_NAME ?? 'intelliflow-api' })`
  from `@intelliflow/observability` (root import is already loaded by trpc.ts:20 after instrument.ts; never import it from the
  otel.ts chain).
- MODIFY `apps/api/src/tracing/middleware.ts`: the three console calls in `tracingMiddleware` become pino calls, emitted
  BEFORE `span.end()`:
  - success `info({ type:'trpc.request', correlationId, path, method, durationMs, status:'success' }, 'trpc request')`
  - slow (>50ms) `warn({ type:'trpc.slow', correlationId, path, method, durationMs, targetMs:50 }, 'slow trpc request')`
  - error `error({ type:'trpc.error', correlationId, path, method, durationMs, status:'error', code, errorName }, 'trpc error')`
    — NO `error.message` (free text; Sentry + span.recordException keep it).
  - `metricsMiddleware` (unused) and `correlation.ts logWithCorrelation` untouched (L1 minimal change; tracked as debt).
- MODIFY `packages/observability/src/logging.ts` `createLogger`: add pino `redact` paths
  (`*.email`, `*.password`, `*.token`, `*.authorization`, `*.cookie`, `req.headers.authorization`, `req.headers.cookie`) with
  censor `[REDACTED]`. Only createLogger users are affected (ai-worker builds its own pino()).
- tenantId/userId stay in Loki (pseudonymous UUIDs; gdpr-compliance.md:89; user.id already on spans). Email never bound.
- Level: success at `info` (a debug default would leave Loki without api lines and defeat the DoD); volume is one line/request.

## Part 2 — read-only evidence collector
- NEW `tools/scripts/observability/collect-observability-evidence.mjs` (+ `.d.mts`), exported `run({ env, argv, fetchImpl, log, now, writeFile })`.
  Reuses `createApiClient` from `tools/scripts/lib/grafana-provisioning.mjs`. GET only. Env `GRAFANA_URL`, `GRAFANA_SA_TOKEN`
  (fail closed if missing). Token only in the Authorization header; errors print status + truncated, bearer-stripped text.
  Retry 503/429 with backoff (stack sleeps); never treat a 503 as "no data".
- Correlation (per service in `--services api,ai-worker`, Tempo/Loki service names as observed):
  1. Loki `{service_name="<svc>"} | trace_id!=""` over the window (default 7d, limit N) → candidate (trace_id, span_id, ts).
  2. Tempo `/api/traces/<trace_id>` → trace found? span_id present? span service matches?
  3. Prometheus `count(traces_spanmetrics_calls_total{service="<svc>"})` → metric series present?
  4. Row `passed=true` only when trace found AND span found AND service matches AND metric present.
  5. No log lines for a service → one row `status=NOT_OBSERVED`, `passed=false` (api until deploy). Never an empty pass.
- MTTD (alert-state-history `{from="state-history"} | json | current="Alerting"`, window 30d):
  - Exclude the IFC-032 delivery test rule. Collapse transitions per (ruleUID, service) with a 30-min gap → incidents.
  - t_alerting = first Normal→Alerting ts of the incident. t_first_error = earliest error span start for that service from
    Tempo search `{resource.service.name="<svc>" && status=error}` in [t_alerting − 30m, t_alerting], bounded below by the
    previous incident's end. No error span found → incident `anchored=false`, excluded from the KPI (counted + listed).
  - MTTD_s = t_alerting − t_first_error. Report n, mean, median, p90, share < 120 s; KPI `MTTD <2min` met iff mean < 120.
    Reported honestly whatever the value. Record rule `for` + group interval read from the provisioning API (GET).
  - Auto-resolve time (Alerting→Normal) labelled as auto-resolve, not human MTTR.
- Output hygiene (fail closed before writing): per-column allowlist regex. Allowed: service (`^[a-z0-9-]{1,40}$`),
  trace_id `^[0-9a-f]{32}$`, span_id `^[0-9a-f]{16}$`, ISO timestamps, integers, booleans, status enum, rule uid
  `^[A-Za-z0-9-]{1,64}$`, rule title `^[A-Za-z0-9 _:().-]{1,80}$`. Forbidden: hosts/URLs, tenant/user ids, raw lines, error
  text, free labels (`asserts_request_context`), response bodies. CSV fully quoted; no logfmt. gitleaks run on both outputs.
- Writes `artifacts/reports/correlation-test.csv` + `artifacts/reports/mttr-baseline.json` (replacing the fabricated files).
  Run locally now → real ai-worker rows + MTTD; api row NOT_OBSERVED → NEEDS_HUMAN until deploy + re-run.

## Part 3 — truthful artifacts & docs
- REWRITE `infra/monitoring/sentry-project-config.json`: real wiring only (dsnEnv `SENTRY_DSN`, environment env, managed by
  Terraform `railway_variable.observability`, init `apps/api/src/tracing/sentry.ts`, services api + ai-worker). No DSN value,
  no hosts, no invented integrations/contacts/keys.
- `docs/observability/IFC-074-IMPLEMENTATION.md`: replace "✅ COMPLETE" with the true status + what is pending.
- `docs/operations/incident-runbook.md:22-23,408`: alert delivery proven by IFC-032 (minimal factual edit).
- `docs/architecture/diagrams/complete-dependency-chains.md`: add IFC-074 to the Observability Stack chain.
- NEW `docs/architecture/adr/ADR-086-observability-log-pipeline-and-evidence.md` (pino→OTLP→Loki as the api/worker log
  standard; Grafana-managed alerting counts as real alerts; evidence only from production telemetry via the read-only collector).
- PRD: N/A (no user-facing feature).
- Out-of-scope red flags → gh issue + debt-ledger + findings doc: logContextMiddleware reads unset ctx.correlationId;
  redactSensitiveData `apiKey` case bug; hostname in pino bindings; dead metricsMiddleware; OTEL_SERVICE_NAME drift
  (Railway hand-set "api" vs Terraform unset); alert-rules.json stale `_comment` path; collector should get a Viewer SA token.

## Tests (TDD)
- `packages/observability/src/logging.test.ts`: REAL createLogger record carries trace_id/span_id under an active span;
  redact masks `email`/`token`.
- NEW `apps/api/src/tracing/logger.test.ts`: lazy singleton, service name from env/default.
- `apps/api/src/tracing/middleware.test.ts`: logger spies for success/slow/error; error record has no message;
  no console.log for trpc.request.
- `apps/api/src/__tests__/trpc.test.ts:189,206`: switch to logger spies.
- `apps/api/src/test/setup.ts`: global `vi.mock('../tracing/logger')` so router suites never hit the real mixin.
- NEW `tools/scripts/__tests__/collect-observability-evidence.test.ts`: fake fetch; GET-only; env missing; correlation pass /
  NOT_OBSERVED / trace missing; MTTD incidents + unanchored + none; 503 retry; non-2xx; allowlist fail-closed; token never in
  log/output.
- Regression: full `api`, `observability`, root-project grafana tests; diff-coverage ≥80% on changed lines.
