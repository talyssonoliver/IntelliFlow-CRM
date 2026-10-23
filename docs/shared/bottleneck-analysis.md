# IFC-033 — Load-Test Bottleneck Analysis (ADR-018 budget)

**Task:** IFC-033 (PHASE-005: Load Testing with k6) · **Gates:** IFC-034 (Gate-3
£3000 investment review) · **Refs:** ADR-018, RISK-S19-02, DDD-001/002 (#621) ·
**Run dates:** 2026-10-22 (production, current evidence) · 2026-07-24 (local
baseline)

> RISK-S19-02 requires **real** benchmark evidence (no template report). The
> tracked artifacts (`artifacts/reports/load-test-report.html`,
> `artifacts/benchmarks/ifc-033-load-summary.json`,
> `artifacts/misc/grafana-load-test.png`) now hold the **2026-10-22 production
> run** (§0). Sections 1–5 keep the 2026-07-24 local run as the baseline; that
> run's own report, summary and Grafana PNG stay in `docs/evidence/ifc-033/`.

## 0. Production run (2026-10-22): throughput PASS, p95 FAIL

IFC-033 was reopened (#795) because the July run targeted `localhost:4000`, not
a deployed environment. No staging environment exists, so on the owner's rulings
of 2026-10-22
(`.specify/sprints/sprint-18/context/IFC-033/IFC-033-owner-ruling.md`) the run
targeted the **production API** inside a dedicated load-test tenant, sized down
to cap the AI scoring cost of each `lead.create`.

| Item    | Value                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Target  | `https://api-production-e9c1.up.railway.app` (Railway `api`, Supabase `eu-central-1`)                                       |
| Window  | 2026-10-22 23:06:36Z to 23:08:54Z                                                                                           |
| Auth    | a dedicated tenant created through `auth.signup` (`tools/scripts/k6/prepare-ifc-033-tenant.mjs`), Bearer token, no dev-auth |
| Profile | 2 min: ingestion 23 per 15 s (1.53 creates/s + 1 read each), conversion 1 per 6 s from a 20-lead QUALIFIED pool             |
| Data    | before the run, the tenant held 21 leads, all `@loadtest.example.com`. Synthetic data is left in place (owner ruling)       |

| Metric                        | Budget             | Achieved                                    | Verdict |
| ----------------------------- | ------------------ | ------------------------------------------- | ------- |
| Lead throughput               | ≥ 5,000 leads/hour | **185 leads in 123 s ≈ 5,435 leads/hour**   | ✅      |
| Error rate                    | < 0.1 %            | **0 %** (0 / 391 requests)                  | ✅      |
| Atomic conversions            | exercised          | **20 / 20** lead→deal                       | ✅      |
| p95 latency (client, k6)      | < 200 ms           | **1,137 ms**                                | ❌      |
| p95 latency (server, Grafana) | < 200 ms           | **POST 2,024 ms, GET 701 ms** (p50 895/389) | ❌      |

k6 exited 99 because the latency thresholds were crossed. The owner ruled that
IFC-033 closes on its throughput KPI, with p95 tracked as the identified
bottleneck (#1001, debt-ledger `PROD-API-DB-CROSS-REGION-LATENCY-001`).

**Identified bottleneck: API-to-database round-trip, about 147 ms per query.**
The median `trpc.mutation.lead.create` trace in Grafana Tempo
(`3fe5f6d158d600bb0d26b4d41c4ae693`, 898 ms server-side) shows every Postgres
statement costing about the same: `BEGIN` 147 ms, `SET` 147 ms, `COMMIT` 148 ms,
each `INSERT`/`SELECT` about 150 ms. A `SET` takes microseconds on the server,
so this is network round-trip time between Railway `api` and Supabase
`eu-central-1`, and six round-trips make up the request. The same code ran at
11.6 ms p95 with the DB on the same host (§2). The fix is to co-locate `api`
with the database, not to tune code. The Railway region could not be read (the
CLI login had expired). Secondary finding from the same trace: `lead.create`
opens a new Redis connection per request for the fire-and-forget `score-lead`
enqueue (17 `tcp.connect` spans per trace).

The July per-user rate-limit ceiling (§3) did not bind: 391 requests in 123 s is
far under 1,000/min.

Evidence: `artifacts/benchmarks/ifc-033-deployed/k6-run-output.txt` (k6 output),
`artifacts/benchmarks/ifc-033-deployed/server-side-telemetry.json` (Grafana
Cloud Prometheus and Tempo numbers), and `artifacts/misc/grafana-load-test.png`,
rendered by Grafana Cloud from dashboard `ifc033-prod-api-load` (the hosted
backend production reports to, IFC-032). Its curves trail the k6 window by about
a minute: the OTLP metric export interval plus the 3-minute `rate()` window.

Reproduce:
`BASE_URL=<api> K6_TEST_EMAIL=<inbox> node tools/scripts/k6/prepare-ifc-033-tenant.mjs`,
load `.env.k6.local` (gitignored), then
`INGEST_RPS=23 INGEST_TIME_UNIT=15s CONVERT_RPS=1 CONVERT_TIME_UNIT=6s DURATION=2m pnpm test:load`.

## 1. Target & method (2026-07-24 local baseline)

| Item           | Value                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target         | `apps/api` HTTP server on `http://localhost:4000` (tRPC at `/api/trpc`)                                                                                   |
| Auth           | dev-auth fallback (`ALLOW_DEV_AUTH_FALLBACK=true`) → seeded user _Sarah Johnson_, tenant _Default Organization_ — **prod-safe, never hits prod Supabase** |
| Data store     | local test Postgres (`intelliflow_test`, pgvector pg16, port 5433) + Redis (6380)                                                                         |
| Load tool      | k6 v0.49.0, `tools/scripts/k6/ifc-033-critical-path.js` (`pnpm test:load`)                                                                                |
| Profile        | 3 min constant-arrival-rate: **lead ingestion** 6 create/s + 6 read/s, **lead conversion** 1/s                                                            |
| Critical paths | `lead.create` (ingestion), `lead.list` / `lead.getById` (reads), `lead.convertToDeal` (DDD-001/002 atomic lead→contact+account+opportunity, #621)         |

## 2. Result vs ADR-018 / IFC-033 budget — PASS

| Metric                  | Budget             | Achieved                                            | Verdict |
| ----------------------- | ------------------ | --------------------------------------------------- | ------- |
| Lead throughput         | ≥ 5,000 leads/hour | **1,081 leads in 180 s ≈ 21,617 leads/hour** (4.3×) | ✅      |
| p95 latency (ingestion) | < 200 ms           | **11.6 ms** (per-path max ≈ 21 ms)                  | ✅      |
| Error rate              | < 0.1 %            | **0 %** (0 / 2,343 requests)                        | ✅      |
| Atomic conversions      | exercised          | **180** lead→deal conversions, 0 failures           | ✅      |

Per-critical-path p95 (Grafana/Prometheus): `lead.create` ≈ 10 ms, reads ≈ 5 ms,
`lead.convertToDeal` ≈ 8–12 ms steady (≈ 35 ms warm-up spike). The transactional
conversion path (#621) — the heaviest write, spanning four aggregates — stays an
order of magnitude under the 200 ms budget under concurrent ingestion load.

## 3. Identified bottleneck — per-user rate limit (the binding constraint)

The **single binding constraint** found is the **per-user `AUTHENTICATED`
rate-limit tier: 1,000 requests / 60 s (~16.7 req/s), keyed by `userId`**
(`apps/api/src/middleware/rate-limit.ts:45`).

Evidence: an earlier over-drive run at 12 create/s + 12 read/s + 2 convert/s (≈
26 req/s, ~43,200 leads/hour) funnelled **all** load through the single dev-auth
user and drew a **uniform 36 % HTTP 429** across every path (`lead.create`
774/2160, reads 777/2160, `convertToDeal` 130/361). Confirmed via Prometheus
`k6_http_reqs_total{status="429"}`; 16.7 ÷ 26 ≈ 64 % admitted, 36 % throttled —
an exact match.

**Interpretation:** this is a **synthetic-harness artifact, not a system
ceiling.** The dev-auth fallback collapses all virtual users onto one `userId`,
so one rate-limit bucket caps the whole test. In production the 5,000 leads/hour
target (≈ 1.4 creates/s) arrives from **many distinct users/integrations**, each
with its own 1,000/min budget, so the limit is never the aggregate bottleneck.
The canonical run above stays inside one user's budget (13 req/s) and passes
cleanly. **No application-layer or database bottleneck was observed** at or well
above the SLO — CPU-bound tRPC handlers and the Prisma pool absorbed 13 req/s
sustained with single-digit-ms p95.

**Recommendations:** (a) distributed / multi-user load (k6 Cloud, per-user
tokens) is required to probe the true aggregate ceiling — tracked under IFC-047;
(b) keep the per-user tier as-is (it is correct DDoS protection); (c) the
conversion path shows a small first-request warm-up (JIT/connection prime) —
negligible at 200 ms budget, worth a cache-warm on boot if ever tightened.

## 4. Tenant isolation (RLS) — verified separately

RLS is **not** asserted inside the k6 perf run: the local test DB connects as
the `postgres` **superuser**, which bypasses Postgres RLS by design, so an
in-run cross-tenant probe would false-positive. Instead it is proven
deterministically at the DB layer, as production runs it (non-superuser role +
tenant GUC):

```
-- role rls_probe (NOSUPERUSER), SET app.current_tenant_id = tenant A (…0001):
own leads visible      = 18
foreign leads visible  = 0     ← RLS blocks cross-tenant
specific foreign lead  = 0     (0c43af30…, tenant cmqk…)
```

Policy `tenant_isolation_leads` (`"tenantId" = get_current_tenant_id()`) is
`ENABLE`d on `leads`. Under a production-like role, foreign-tenant rows are
invisible. (Note: querying `lead.getById` for a foreign id **does** return data
against the local superuser connection — that is the superuser bypass, not a
product defect.)

## 5. Scope & honesty notes

- Budget is the **ADR-018 MVP budget** (5,000 leads/hour, p95 < 200 ms, err <
  0.1 %). The aspirational "1,000 concurrent users / p99 < 100 ms" framing is
  **IFC-047** (Sprint 22, k6 Cloud) — out of scope here (see
  `docs/operations/runbooks/load-testing-local.md`).
- Target ran under `tsx` (dev transpile) — a production `next build`/compiled
  API would only be faster; the budget is met with margin regardless.
- Reproduce: bring up test DB + `apps/api` (dev-auth), seed a QUALIFIED-lead
  pool, then `pnpm test:load`. Grafana evidence needs the monitoring stack
  (`infra/monitoring/docker-compose.monitoring.yml`) +
  `K6_PROMETHEUS_RW_SERVER_URL`.
