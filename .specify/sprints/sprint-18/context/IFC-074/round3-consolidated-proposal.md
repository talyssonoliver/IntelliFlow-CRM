# IFC-074 — Consolidated proposal for Round 3 (CHALLENGE)

Supersedes round2-lead-draft.md. Changes vs the draft are marked [R2-<agent>].

## Part 1 — api logs through pino
- NEW `apps/api/src/tracing/logger.ts`: `getApiLogger(): Logger` (lazy singleton,
  `createLogger({ name: process.env.OTEL_SERVICE_NAME?.trim() || 'intelliflow-api' })`) and
  `resetApiLoggerForTests(): void`. [R2-Backend]
- MODIFY `apps/api/src/tracing/middleware.ts` `tracingMiddleware`: console calls → pino, emitted BEFORE `span.end()`.
  - success `info {type:'trpc.request', correlationId, path, method, durationMs, status:'success'}`
  - slow >50ms `warn {type:'trpc.slow', correlationId, path, method, durationMs, targetMs:50}`
  - error `{type:'trpc.error', correlationId, path, method, durationMs, status:'error', code, errorName}`; level `warn` for
    client codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, TOO_MANY_REQUESTS, PRECONDITION_FAILED, CONFLICT,
    PAYLOAD_TOO_LARGE, METHOD_NOT_SUPPORTED, UNPROCESSABLE_CONTENT, PARSE_ERROR, CLIENT_CLOSED_REQUEST), `error` otherwise.
    [R2-Backend]
  - `errorName` must match `^[A-Za-z][A-Za-z0-9_]{0,60}$`, else `'Error'`. Never message/stack/cause. [R2-Security]
- MODIFY `packages/observability/src/logging.ts` `createLogger`: pino `redact` with top-level AND nested paths
  (`email,*.email,userEmail,password,*.password,token,*.token,accessToken,refreshToken,apiKey,*.apiKey,api_key,secret,
  *.secret,authorization,*.authorization,cookie,*.cookie,req.headers.authorization,req.headers.cookie`), censor
  `[REDACTED]`. [R2-Security/Backend/Test]
- `apps/api/src/test/setup.ts`: global `vi.mock('../tracing/logger')` with a `vi.hoisted` spy object and plain-arrow
  `getApiLogger` (survives mockReset) + `trace.getActiveSpan: () => undefined` on the global OTel mock. [R2-Test/Backend]

## Part 2 — read-only collector
- NEW `tools/scripts/observability/collect-observability-evidence.mjs` + `.d.mts`;
  `run({ env, argv, fetchImpl, log, now, sleep, writeFile })`. Proxy helpers `lokiQueryRange`, `tempoSearch`,
  `tempoTrace`, `withRetry` added to `tools/scripts/lib/grafana-provisioning.mjs`; reuse `createApiClient` (GET only,
  asserted) and `querySeriesCount` (1h lookback) for the metric leg. [R2-DevOps]
- CLI: `--services api,ai-worker --log-window-days 7 --alert-window-days 30 --max-traces 10 --out-dir artifacts/reports
  --dry-run`.
- Retry 429/502/503/504 ×5 (5/10/20/40/60s, honour Retry-After), sequential requests; other non-2xx fail fast; exhausted
  → exit 1, nothing written. Errors print `HTTP <status> <endpoint-name>` only (no body, no URL). [R2-DevOps/Security]
- Alert history fetched in 7-day slices. Rule `for`/interval via GET `/api/v1/provisioning/alert-rules`. [R2-DevOps]
- CSV columns: `test_id,service,trace_id,span_id,log_ts,trace_found,span_found,service_match,metric_series,status,passed,
  query_window_start,query_window_end,collected_at`; status ∈ PASS|FAIL|NOT_OBSERVED; fully quoted.
- `mttr-baseline.json`: `schema_version, task_id, generated_at, measurement_method:"grafana-cloud-readonly-collector",
  windows, rules[]{uid,alertname,for,interval}, incidents[]{rule_uid,alertname,service,t_alerting,t_first_error,
  first_error_trace_id,trace_resolves,mttd_s,anchored,auto_resolve_s}, exclusions[]{rule_uid,reason,count},
  aggregates{n_incidents,n_anchored,n_unanchored,median_s,p90_s,mean_s,share_lt_120s}, kpi{target_s:120,
  statistic:"median",met,cause_if_not_met}, limitations[]`. No stack URL/datasource UIDs in output. [R2-DevOps/Security]
- MTTD: incident = run of Normal→Alerting per (ruleUID, service) split by ≥30 min gap. Exclusions declared up front:
  IFC-032 delivery-test rule, `asserts_up` (telemetry-absence, not error detection), unanchored incidents (listed).
  KPI met iff **median** < 120 s, p90 shown beside it. [R2-Domain]
- Allowlist (fail closed): service `^[a-z0-9-]{1,40}$`; trace `^[0-9a-f]{32}$`; span `^[0-9a-f]{16}$`; ts
  `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?Z$`; numbers `^\d{1,12}(\.\d{1,3})?$`; bool; status enum; rule uid
  `^[A-Za-z0-9_-]{1,64}$`; alertname `^[A-Za-z][A-Za-z0-9_:]{0,63}$` (titles only for committed repo uids); free labels
  (`asserts_*`, request_context) dropped before validation. No column/key name containing key/token/auth/secret/api.
  Atomic writes (temp + rename) after both outputs validate. [R2-Security/DevOps]
- Runs locally only (not CI). Admin SA token used read-only today; a Viewer SA token is a tracked follow-up.

## Part 3 — truthful artifacts & docs
- `infra/monitoring/sentry-project-config.json` rewrite: api + web initialise Sentry (`apps/api/src/tracing/sentry.ts`,
  `apps/web/src/lib/sentry/init.ts`); ai-worker has SENTRY_DSN provisioned but no SDK init (finding); env-var names only;
  traces sample rate default 0.1; disabled in development; managed by Terraform `railway_variable.observability`; project
  existence in Sentry = NEEDS_HUMAN (org token lacks project read). [R2-DevOps]
- Docs: IFC-074-IMPLEMENTATION.md:5 and :482-484; incident-runbook.md:22-23,408; dependency chain adds IFC-074.
  [R2-Domain]
- ADR-086 (083–085 claimed by sibling worktrees): pino→OTLP→Loki log standard; Grafana-managed asserts rules count as
  real alerts; evidence only from production telemetry via the collector; supersedes ADR-001's "Prometheus" line.
- task-tracking.json: remove fabricated `kpis` values; blockers 21/26 resolved only when replaced by collector output;
  close-rule blocker stays open until AC-002. Attestation rebuilt by /exec-attestation with real exit codes.

## Acceptance criteria (Domain R2)
AC-001 ai-worker correlation PASS (pre-merge) · AC-002 api correlation PASS (NEEDS_HUMAN post-deploy) · AC-003 api pino
line carries trace ids, no message/PII (unit tests) · AC-004 MTTD measured from real transitions · AC-005 root cause
identifiable (anchored incident → resolving trace) · AC-006 Sentry config truthful · AC-007 fabricated KPI/attestation
entries removed · AC-008 docs + ADR truthful · AC-009 CSV stays In Progress until AC-002.
