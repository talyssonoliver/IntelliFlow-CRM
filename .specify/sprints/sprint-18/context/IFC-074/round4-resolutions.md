# IFC-074 — Round 3 challenges and lead resolutions (input to Round 4 CONSENSUS)

Base: round3-consolidated-proposal.md. Each line: challenge → resolution.

## Part 1 (api logger)
1. Level split by TRPC code (Backend R2) vs over-scope (Domain R3) → **RESOLVED: all failures stay at `error`**, matching
   today's `console.error` for every failure (middleware.ts:202). The client-code split is a tracked follow-up (issue). L1.
2. Logger must be created lazily, never at module load (Backend R3, instrumentation-pino patches `pino()` at call time)
   → AC + test: importing logger.ts does not call createLogger.
3. `path` validated `^[A-Za-z0-9_.]{1,120}$` else `'invalid'`; `requestId` (client-supplied) never logged (Security R3).
4. `errorName` fallback test cases incl. spaces/newline/>61 chars (Test R3).
5. Redact `it.each` over every path, top-level + nested (Test R3).
6. Real-record tests live in packages/observability: in-memory destination via `vi.spyOn(pino, 'destination')`
   (no temp file — Windows EBUSY), plus an OTLP test registering `PinoInstrumentation` with an in-memory log exporter
   asserting the exported record carries the active span's trace_id/span_id (Backend R3 __toESM interop).
   `logger.test.ts` mocks `createLogger` and asserts the name (no pino-pretty worker) (Test R3).
7. Slow-path test uses `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime` (Test R3).
8. AC-002 preconditions: Railway api has OTEL_EXPORTER_OTLP_ENDPOINT set, OTEL_LOGS_EXPORTER unset/otlp, LOG_LEVEL ≤ info,
   NODE_ENV=production; and at least one real tRPC call after deploy (Backend R3, DevOps R3).

## Part 2 (collector)
9. Earliest error span: Tempo search `limit=50`, min `startTimeUnixNano` over returned spans; narrow window until <50
   (DevOps R3). Tempo traceIDs left-padded to 32 hex (lead, verified live: search may strip leading zeros).
10. Alert transitions: `current=~"Alerting.*"`, `previous` from parsed JSON (Normal or Pending); record `pending_s` when a
    Pending start is found (DevOps R3).
11. Loki trace filter `| trace_id!=""` on structured metadata; never `| json` on OTLP bodies (DevOps R3). Loki
    `service_name` = OTel resource `service.name`; `--services` defaults to the names observed in Tempo (`api`,
    `ai-worker`) (Backend R3).
12. Metric leg tied to the logged event: instant query at `time=log_ts` of
    `count(sum_over_time(traces_spanmetrics_calls_total{service="<svc>",span_name="<span name>"}[5m]))` (or
    `count_over_time` equivalent) — not "any series in the last hour" (Domain R3).
13. Root cause identifiable: each anchored incident records `first_error_span_name` + `first_error_service` (allowlisted:
    `^[A-Za-z0-9_.:/ -]{1,80}$` and must NOT look like a hostname `[a-z0-9-]+\.[a-z0-9-]+\.[a-z]{2,}`, else
    `"redacted"`) (Domain R3, Security).
14. KPI statistic = **mean** (row says MTTD; Domain withdrew median). median/p90/share_lt_120s are diagnostics. Zero
    anchored incidents → `kpi.met = null` (DevOps R3). Negative MTTD (clock skew) → `anchored=false` (DevOps R3).
15. Exit codes: 0 = written, all required evidence present; 2 = written but ai-worker has zero PASS rows or zero anchored
    incidents (ADR-017 "block on missing traces") (Domain R3); 1 = error, nothing written, temp files removed (Security R3).
16. `--since <ISO>` limits correlation to traffic after a deploy (DevOps R3). Warm-up GET `/api/health` before queries.
17. Free-text JSON fields (`limitations[]`, `exclusions[].reason`, `cause_if_not_met`) come only from constants in the
    collector (Security R3). Collector prints SHA-256 of each output (Security R3).
18. New lib helpers get direct tests in `tools/scripts/lib/grafana-provisioning.test.ts` (Test R3).
19. Token: env only, never CLI arg; GET-only assert; sentinel-token negative tests (log, thrown errors, written bytes,
    echoed bodies) (Security R3).

## Part 3
20. task-tracking.json: fabricated KPI values → `actual: null, met: null` (keys kept), `completed_at` → null,
    `status_history` append-only (Domain R3).
21. Sentry config describes only; no ai-worker Sentry code change (finding) (Domain R3).

## Findings to track (gh issue + debt-ledger + findings doc), not fixed here (L1)
F1 logContextMiddleware reads unset `ctx.correlationId` (trpc.ts:107-116) · F2 `redactSensitiveData` `apiKey` case bug
(logging.ts:494-517) · F3 `hostname` in pino bindings (logging.ts:89-94) · F4 dead `metricsMiddleware`
(middleware.ts:229-264) · F5 OTEL_SERVICE_NAME drift (Railway "api" vs Terraform unset / code default) · F6
alert-rules.json stale `_comment` path · F7 collector should use a Viewer SA token · F8 `base.environment` reads unset
`ENVIRONMENT` → "development" in prod (logging.ts:66-69) · F9 SIGTERM race: main.ts exits before OTel flush
(main.ts:26-32 vs otel.ts:155-163) · F10 ai-worker SENTRY_DSN provisioned but SDK never initialised · F11 TRPC
client-code log-level split · F12 ai-worker pino lines unredacted · F13 admin procedures skip logContextMiddleware
(trpc.ts:312,567-571).
