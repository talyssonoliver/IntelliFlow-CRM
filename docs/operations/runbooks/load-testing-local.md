# Local Load Testing (honest perf budget)

**Status:** active · **Refs:** ADR-018, issue #318 (caveat 2), IFC-007
(reframed), IFC-047 (real implementation, Sprint 22)

## TL;DR — what changed and why

The headline **"1,000 concurrent users, p99 <100ms"** (IFC-007 acceptance text)
was **never measured**. IFC-007 was marked _Completed_ by **artifact existence**
only — its own evidence record says verbatim:
`"Evidence stub. Task marked Completed in Sprint_plan.csv."`, and the
attestation notes _"both verified by artifact existence"_.

That number is also **infra-impossible at MVP**: the DB pooler runs
`pool_size 15` (see `packages/db/src/client.ts`), Supabase Realtime caps ~200
concurrent connections, and Vercel/Railway are on Hobby plans. A single laptop
also cannot generate 1,000 _real_ VUs — it becomes the bottleneck, not the
server.

So we test against the **real, documented budget** instead.

## The budget (ADR-018)

| Metric           | Budget            |
| ---------------- | ----------------- |
| Throughput       | ~5,000 leads/hour |
| Latency          | **p95 < 200 ms**  |
| Error rate       | **< 0.1 %**       |
| Web (Lighthouse) | scores > 90       |

"1,000 concurrent users" is retained only as a **future scale target**, gated on
plan upgrades (Supabase Pro pooler, Vercel Pro) and a distributed load generator
(k6 Cloud) — tracked under **IFC-047**, not this MVP task.

## Prerequisites

1. **k6** installed — `winget install k6` / `choco install k6` /
   `brew install k6`, or `tools/scripts/k6/install-k6.ps1`.
2. The target **app running** (local is the default/recommended target):
   `pnpm dev` (or the specific service you want to hit).
3. A **seeded dataset** so reads/writes hit realistic data.

## Run it

```bash
# 1. seed the local dataset
pnpm run db:seed

# 2. validate the SLO at the steady-state budget (defaults to localhost)
k6 run tools/scripts/k6/mvp-load-test.js

# point at another local/preview target, or push above the SLO to find headroom:
BASE_URL=http://localhost:3000 TARGET_RPS=20 DURATION=2m \
  k6 run tools/scripts/k6/mvp-load-test.js
```

The script prints p95 latency and error rate against the budget, and **aborts**
the moment either budget blows (`abortOnFail`) — so even a misfire against a
non-local target cannot sustain damage.

### Safety

- **Default + recommended target is local.** Do **not** point a high
  `TARGET_RPS` ramp at production — the Hobby infra can't sustain it and it
  costs real money.
- The legacy `tools/scripts/k6/load-test.js` (1,000-VU ramp, p99<100ms) is kept
  as the **aspirational scale profile** for IFC-047; it is not the MVP gate.

## Interpreting results / next steps

- p95 < 200 ms and errors < 0.1 % at ~5k/hour → the MVP SLO holds. Record the
  numbers in the attestation when IFC-047 is implemented.
- To find the real ceiling, raise `TARGET_RPS` until p95 crosses 200 ms or
  errors cross 0.1 %; that headroom is the honest capacity figure for the
  current plan.
- CI: `.github/workflows/performance-gate.yml` exists as a manual
  (`workflow_dispatch`) job; wire a `schedule:` + sized runner under IFC-047
  once the seed + thresholds are stable.
