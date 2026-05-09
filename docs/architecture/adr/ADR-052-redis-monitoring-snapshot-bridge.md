# ADR-052: Redis-Backed AI Monitoring Live Snapshot Bridge

**Status:** Accepted

**Date:** 2026-04-26

**Deciders:** Backend Lead, AI Specialist (STOA-Intelligence); ratified at
exec-time by Claude Code per the IFC-214 attestation on 2026-04-26.

**Technical Story:** IFC-214

> **ℹ️ Extends [ADR-043](./ADR-043-ai-monitoring-data-persistence.md) (DB-backed
> AI monitoring persistence).** Does NOT replace ADR-043 — the DB tier remains
> the durable store. ADR-052 introduces a complementary low-latency Redis tier
> in front of the DB.

## Context and Problem Statement

ADR-043 (IFC-297) made `AIMonitoringEvent` (PostgreSQL) the durable backing
store for AI monitoring data, with a `MonitoringFlushService` draining ai-worker
singletons every 60s. This solved the multi-process problem (the API process
gets real data instead of empty singletons) but introduced two operational gaps:

1. **Up to 60s of monitoring lag** — explicitly accepted as a "Negative
   Consequence" in ADR-043 §Decision Outcome. For incident response and live SLO
   dashboards this is too slow.
2. **`AIMonitoringEvent` reads scan large rowsets** (e.g. `getLatencyMetrics`
   reads up to 10 000 events to compute percentiles). Even with the
   `(tenantId, eventType, recordedAt)` composite index, p95 query latency on
   warm caches is ~150–250 ms; on cold caches it is multi-second.

Risk register entry **R-016 (Cache Poisoning, score 8, Owner: Backend Lead,
Status: Planned)** is currently un-mitigated because no Redis cache layer exists
in front of monitoring reads. Adding one without explicit cache-poisoning
controls would _increase_ R-016's exposure.

Question: how do we close the freshness gap and the read-latency gap **while
reducing** R-016 instead of amplifying it?

## Decision Drivers

- **Freshness target**: cross-process metric consistency ≥ 99 % within 10 s (CSV
  KPI for IFC-214).
- **Read latency target**: Redis read p95 < 50 ms (CSV KPI for IFC-214).
- **R-016 mitigation**: malformed payload acceptance must equal 0 (CSV KPI).
- **Multi-tenancy**: monitoring data is tenant-scoped except for `drift` events
  that include `tenantId: null` global signals (see
  `AIMonitoringService.driftTenantFilter` at
  `apps/api/src/services/AIMonitoringService.ts:59`).
- **Operational fallback**: a Redis outage must not 500 the dashboard — it must
  degrade gracefully to the DB-backed reader from ADR-043.
- **No new infra**: Redis is already provisioned and used by BullMQ
  (`packages/platform/src/queues/connection.ts`) and rate limiting
  (`apps/api/src/middleware/rate-limit.ts:209`). No new component to deploy.
- **Test ergonomics**: the integration test must exercise a _real_ cross-process
  path (worker writes → API reads), not mocks, because the whole reason this
  layer exists is to bridge two processes.

## Considered Options

- **Option 1**: Redis live snapshot bridge (publish-on-flush + read-through
  cache, with Zod-validated tenant-namespaced keys, version prefix, TTL ≥
  publish cadence).
- **Option 2**: Redis Streams / pub-sub replacing the DB tier — same as ADR-043
  Option 3, previously rejected.
- **Option 3**: Shorten the DB flush cadence (e.g. 60s → 5s) and add a Postgres
  LISTEN/NOTIFY to the API.
- **Option 4**: PostgreSQL materialized views refreshed on a tight cadence.

## Decision Outcome

Chosen option: **Option 1 — Redis live snapshot bridge**.

The ai-worker process gains a `RedisMonitoringPublisher` that runs alongside
`MonitoringFlushService`. Every 5 s (configurable via
`AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS`) it computes the same five
tenant-scoped snapshots the router needs (`status`, `drift`, `latency`,
`hallucination`, `roi`) by **querying the Postgres `AIMonitoringEvent` table**
that `MonitoringFlushService` keeps populated (deliberately _not_ the per-pod
in-memory singletons — see "Why publisher reads from DB, not singletons" below).
The publisher then `SET`s each snapshot into Redis under a tenant-namespaced
versioned key with a TTL of 30 s (6× the publish cadence).

**Why publisher reads from DB, not singletons:** in a multi-pod ai-worker
deployment each pod's singletons hold only the events that pod processed;
reading singletons would publish a per-pod view to Redis, defeating
cross-process consistency. The Postgres table is the only multi-pod aggregation
point. The 5 s publisher tick re-publishes the aggregated DB view to Redis with
low read latency.

The API process gains a `RedisAIMonitoringStore` that wraps the existing
`AIMonitoringService` (DB-backed). Each of the five read methods first attempts
a Redis `GET`+Zod-validate; on hit returns the snapshot; on miss / parse-fail /
Redis error falls through to the existing `AIMonitoringService.<method>` DB
query. The router (`apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`)
is rewired to call the new store, not the DB-backed service directly.

### Positive Consequences

- Cross-process freshness drops from 60s (ADR-043) to ≤ 10s worst case (publish
  cadence + read-side TTL grace).
- Hot-path reads collapse from ~150–250 ms (DB scan + percentile in JS) to < 5
  ms (Redis `GET` + Zod parse).
- R-016 (Cache Poisoning) moves from `Planned` to `Mitigated` with three
  explicit controls: (a) tenant-scoped key namespacing, (b) Zod schema
  validation on every read, (c) version prefix in the key (`ai-mon:v1:…`) so a
  future schema change cannot accidentally read stale objects of a different
  shape.
- Redis outage = silent degradation: existing DB tier serves traffic, just
  slower. No 500s.
- Reuses existing Redis (no infra cost). Reuses existing `ioredis` lazy-import
  pattern (`apps/api/src/container.ts:188`) so test environments without Redis
  still work.

### Negative Consequences

- Adds one extra Redis round-trip per monitoring read. Acceptable: < 5 ms vs.
  the 150–250 ms DB read it replaces.
- Snapshot computation in `RedisMonitoringPublisher.tick()` is
  `O(tenants × eventTypes)`. With < 100 tenants and 5 event types this is
  trivial; we will revisit if tenant count grows past 1 000.
- One more thing to forget to deploy. Mitigated by wiring the publisher
  start/stop into `ai-worker.ts` lifecycle next to `MonitoringFlushService`
  (same pattern as IFC-297) and by making the read-side store fall through to DB
  when the publisher is absent.

## Pros and Cons of the Options

### Option 1: Redis live snapshot bridge

- Good, because freshness goes from 60s to ≤10s with no DB load increase
- Good, because three layered cache-poisoning mitigations close R-016
- Good, because Redis outage degrades to existing DB tier — no new failure mode
- Good, because the ADR-043 contract (DB is durable store) is preserved
- Bad, because adds one moving part on the worker side

### Option 2: Redis Streams replacing DB tier

- Good, because lowest latency
- Bad, because data lost on Redis restart — same reason ADR-043 rejected this
- Bad, because removes the historical/time-range query path the dashboards
  depend on

### Option 3: Shorter flush cadence + LISTEN/NOTIFY

- Good, because no new tech
- Bad, because 5s DB writes from 5+ ai-worker pods quickly saturate Postgres
  write IOPS
- Bad, because LISTEN/NOTIFY does not support multi-tenant filtering well

### Option 4: PG materialized views

- Good, because read latency is excellent
- Bad, because `REFRESH MATERIALIZED VIEW` on a 5s cadence is brutal under load
- Bad, because does not actually solve the freshness problem (refresh interval =
  lag)

## Implementation Notes

### Key namespacing (R-016 control 1)

Format: `ai-mon:{schemaVersion}:{tenantId}:{snapshotKind}` — e.g.
`ai-mon:v1:01H8…:status`, `ai-mon:v1:01H8…:latency`. Drift snapshots that
include global `tenantId: null` events are written to BOTH the tenant key and a
separate `ai-mon:v1:global:drift` key; the read-side store merges them per the
`driftTenantFilter` semantics already in `AIMonitoringService.ts:59`.

### Payload schema + versioning (R-016 controls 2 & 3)

Reuse the response shapes already returned by `AIMonitoringService`
(`getStatus`, `getDriftMetrics`, etc.), validated by per-shape Zod schemas
exported from `apps/api/src/modules/ai-monitoring/ai-monitoring.redis-store.ts`.
The schemaVersion `v1` is encoded in the key prefix; a future migration would
introduce `v2` keys read in parallel during a deploy window.

### TTL

`AI_MONITORING_REDIS_TTL_SECONDS` defaults to 30.
`AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS` defaults to 5 000. The 6× ratio
guarantees that even one missed publish (worker restart) does not produce a
stale-empty window — the API will see "miss" and fall through to DB rather than
read an expired snapshot.

### Outage fallback

`RedisAIMonitoringStore` catches _every_ exception from the Redis client and
returns `{ source: 'db', value: await aiMonitoringService.<method>(opts) }`. The
store never throws on Redis failure. An optional `notes` field on the response
(suppressed in production) lets tests assert which path served the request.

### Cross-process integration test

`apps/api/src/modules/ai-monitoring/__tests__/ai-monitoring.redis.integration.test.ts`
spins up a real `ioredis` client against `REDIS_URL` (skipped if `REDIS_URL`
unset, exactly like the existing `getBullMQConnectionOptions()` pattern). The
test:

1. Constructs a `RedisMonitoringPublisher` and calls `tick()` once with a
   fixture set of singleton state.
2. Constructs a `RedisAIMonitoringStore` against the same Redis.
3. Calls each of the five read methods and asserts the response matches the
   fixture and `source === 'redis'`.
4. Closes the publisher and waits TTL+1s; asserts the next read returns
   `source === 'db'`.

### Validation Criteria

- [ ] `apps/ai-worker/src/monitoring/redis-monitoring-publisher.ts` publishes 5
      snapshot kinds × N tenants every 5 s.
- [ ] `apps/api/src/modules/ai-monitoring/ai-monitoring.redis-store.ts` provides
      drop-in replacements for the 5 monitoring methods on
      `AIMonitoringService`.
- [ ] `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts` wired to call
      the new store.
- [ ] Integration test asserts cross-process consistency.
- [ ] Redis read p95 < 50 ms (KPI gate).
- [ ] Malformed payload acceptance = 0 (KPI gate, asserted by negative-path
      tests).
- [ ] Test coverage ≥ 90 % on the two new files (KPI gate).
- [ ] Risk register R-016 status updated `Planned` → `Mitigated`.

### Rollback Plan

Setting `AI_MONITORING_REDIS_DISABLED=1` causes `RedisAIMonitoringStore` to
bypass Redis and return the DB result on every call. The router does not need to
change. The publisher is also gated by the same env var so it stops emitting.
Removing the file artifacts after that flag has been live for 1 release is the
full rollback.
