# IFC-033 — Load-Test Bottleneck Analysis (ADR-018 budget)

**Task:** IFC-033 (PHASE-005: Load Testing with k6) · **Gates:** IFC-034 (Gate-3
£3000 investment review) · **Refs:** ADR-018, RISK-S19-02, DDD-001/002 (#621) ·
**Run date:** 2026-07-24

> RISK-S19-02 requires **real** benchmark evidence (no template report). Every
> figure below is from an actual k6 execution captured in
> `artifacts/reports/load-test-report.html` (k6 web dashboard, real timestamps),
> `artifacts/benchmarks/ifc-033-load-summary.json`, and
> `artifacts/misc/grafana-load-test.png` (Grafana over Prometheus remote-write).

## 1. Target & method

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
