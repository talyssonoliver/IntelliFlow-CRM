/**
 * IFC-214 — Redis-backed AI Monitoring State Bridge: cross-process integration.
 *
 * Gating (the REAL story — supersedes the old apps/api file's incorrect header):
 *   - Runs in the `integration` vitest project (root `tests/integration/`) via
 *     `pnpm run test:integration` — the CI "Integration Tests" job provisions a
 *     real Redis (`REDIS_URL`) and Postgres, and pre-ship runs the same lane.
 *   - `describe.skipIf(!REDIS_URL)` skips when no Redis URL is configured.
 *   - Each case ALSO `ctx.skip()`s when `REDIS_URL` is set but the server is
 *     unreachable (probed once in `beforeAll`), so a stale/misconfigured URL
 *     never fails the gate — it skips cleanly.
 *
 * Why this lives in `tests/integration/` (not apps/api): unlike the apps/api unit
 * project, the integration project may import across the api <-> ai-worker
 * package boundary (see `tests/integration/cross-tenant.test.ts`). That lets T-I1
 * drive the REAL `RedisMonitoringPublisher` (ai-worker) writing real keys, read
 * back by the REAL `RedisAIMonitoringStore` (api) over real Redis — the literal
 * DoD: "cross-process integration test verifies worker writes are visible to
 * API." The old apps/api file could only hand-roll a publisher-shaped payload
 * because it could not import the publisher; it was also excluded from every gate
 * (apps/api/vitest.config.ts excludes the integration-test filename suffix) so it
 * verified nothing.
 *
 * Test cases (from spec §Test Plan):
 *   T-I1 REAL worker->API — publisher.tick() writes Redis -> real store reads source=redis
 *   T-I2 latency       — 100 reads, p95 < 50 ms (KPI gate)
 *   T-I3 outage fallback — TTL expires -> store reads source=db
 *   T-I4 tamper        — SET garbage over valid -> store reads source=db (malformed acceptance = 0)
 *   T-I5 version isolation — v0-prefixed key invisible to the v1 reader
 *
 * @task IFC-214
 * @see docs/architecture/adr/ADR-052-redis-monitoring-snapshot-bridge.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RedisAIMonitoringStore,
  __test,
  type RedisLike,
} from '../../apps/api/src/modules/ai-monitoring/ai-monitoring.redis-store';
import { RedisMonitoringPublisher } from '../../apps/ai-worker/src/monitoring/redis-monitoring-publisher';

const REDIS_URL = process.env.REDIS_URL ?? null;
const TENANT = '01H8BRIDGEAAAAAAAAAAAAAAAA';

interface IORedisClient extends RedisLike {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
}

// Publisher's only DB seam. Stub handles BOTH the distinct-tenants probe and the
// per-tenant fetch — same shape as redis-monitoring-publisher.test.ts.
interface FixtureEvent {
  tenantId: string | null;
  eventType: string;
  recordedAt: Date;
  value?: number;
  flagged?: boolean;
  severity?: string | null;
  metric?: string | null;
  model?: string | null;
  payload?: unknown;
}

function makePrismaWithEvents(events: FixtureEvent[]) {
  const findMany = async (args: {
    distinct?: unknown;
    where?: { tenantId?: string | null };
  }): Promise<unknown> => {
    if (args?.distinct) {
      const seen = new Set<string | null>();
      const uniq: { tenantId: string | null }[] = [];
      for (const e of events) {
        if (!seen.has(e.tenantId)) {
          seen.add(e.tenantId);
          uniq.push({ tenantId: e.tenantId });
        }
      }
      return uniq;
    }
    const want = args?.where?.tenantId;
    return events.filter((e) => e.tenantId === want);
  };
  return { aIMonitoringEvent: { findMany } };
}

const baseEvent = (over: Partial<FixtureEvent>): FixtureEvent => ({
  tenantId: TENANT,
  eventType: 'latency',
  recordedAt: new Date('2026-04-27T00:00:00Z'),
  value: 0,
  flagged: false,
  severity: null,
  metric: null,
  model: null,
  payload: null,
  ...over,
});

// DB fallback sentinel — distinct from any Redis-served value so source is unambiguous.
function makeServiceMock() {
  return {
    getStatus: async () => ({ source: 'real-db-status' }) as never,
    getDriftMetrics: async () => ({ source: 'real-db-drift' }) as never,
    getLatencyMetrics: async () => ({ source: 'real-db-latency' }) as never,
    getHallucinationReport: async () => ({ source: 'real-db-hallucination' }) as never,
    getROIMetrics: async () => ({ source: 'real-db-roi' }) as never,
  };
}

const validStatusSnapshot = {
  available: true,
  healthy: true,
  issues: [],
  drift: { trackedMetrics: 1, driftDetected: false, highSeverityCount: 0 },
  latency: { sloCompliant: true, p95: 100, p99: 200 },
  hallucination: { rate: 0.01, kpiCompliant: true, totalChecks: 100 },
  roi: { currentROI: 50, totalCost: 10, totalValue: 15 },
};

describe.skipIf(!REDIS_URL)('IFC-214 cross-process bridge (REDIS_URL set)', () => {
  let redis: IORedisClient;
  let redisReady = false;
  // Unique tenant per worker to avoid collisions across parallel CI invocations.
  const RUN_TENANT = `${TENANT}_${process.env.VITEST_WORKER_ID ?? 'x'}`;

  beforeAll(async () => {
    const ioredis = await import('ioredis');
    const RedisCtor = (ioredis.default ?? ioredis) as unknown as new (
      url: string,
      opts?: Record<string, unknown>
    ) => IORedisClient;
    redis = new RedisCtor(REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      // Fail fast on an unreachable host instead of retrying forever — a
      // set-but-unreachable REDIS_URL must skip, not hang the suite.
      retryStrategy: () => null,
    });
    // Probe reachability — set-but-unreachable REDIS_URL skips cleanly (never
    // fails the gate). lazyConnect requires an explicit connect() before commands.
    try {
      await redis.connect();
      await redis.ping();
      redisReady = true;
    } catch {
      redisReady = false;
    }
  });

  afterAll(async () => {
    if (!redis) return;
    if (redisReady) {
      const keys = await redis.keys(`ai-mon:v1:${RUN_TENANT}:*`);
      if (keys.length) {
        await Promise.all(keys.map((k) => redis.del(k)));
      }
      await redis.quit();
    } else {
      try {
        redis.disconnect();
      } catch {
        /* never connected */
      }
    }
  });

  it('T-I1 REAL worker->API: publisher.tick() writes Redis -> real store reads source=redis', async (ctx) => {
    if (!redisReady) return ctx.skip();
    // Seed the publisher's DB seam with ROI + latency events for RUN_TENANT, then
    // run ONE real publish cycle. This exercises the REAL ai-worker write path.
    const events: FixtureEvent[] = [
      baseEvent({ eventType: 'roi_cost', value: 10, tenantId: RUN_TENANT }),
      baseEvent({ eventType: 'roi_value', value: 15, tenantId: RUN_TENANT }),
      baseEvent({ eventType: 'latency', value: 100, tenantId: RUN_TENANT }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis as never, prisma as never, {
      lookbackMs: 7 * 24 * 60 * 60 * 1000,
      ttlSeconds: 30,
      disabled: false,
    });
    const result = await pub.tick();
    expect(result.written).toBeGreaterThan(0);

    // Real store reads the real publisher's writes across real Redis.
    const store = new RedisAIMonitoringStore({ redis, service: makeServiceMock() as never });
    const status = await store.getStatus({ tenantId: RUN_TENANT });
    expect(status.source).toBe('redis');
    expect(status.value).toMatchObject({ available: true });
    // The status snapshot's ROI summary reflects the published events (cost 10, value 15).
    expect((status.value as { roi: { totalCost: number; totalValue: number } }).roi).toMatchObject({
      totalCost: 10,
      totalValue: 15,
    });
    // A second kind (ROI) is also Redis-served from the same publish cycle.
    const roi = await store.getROIMetrics({ tenantId: RUN_TENANT });
    expect(roi.source).toBe('redis');
  });

  it('T-I2 latency: 100 store.getStatus calls p95 < 50 ms', async (ctx) => {
    if (!redisReady) return ctx.skip();
    const key = __test.redisKey(RUN_TENANT, 'status');
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 60);
    const store = new RedisAIMonitoringStore({ redis, service: makeServiceMock() as never });
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const r = await store.getStatus({ tenantId: RUN_TENANT });
      samples.push(performance.now() - start);
      expect(r.source).toBe('redis');
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? 0;
    expect(p95).toBeLessThan(50);
  });

  it('T-I3 outage fallback: key expiry -> store reads source=db', async (ctx) => {
    if (!redisReady) return ctx.skip();
    const key = __test.redisKey(RUN_TENANT, 'status');
    // Establish the key, then DELETE it to deterministically reproduce TTL
    // expiry. The previous approach (SET ... EX 1 + real setTimeout(2100)) is a
    // real-timer/real-TTL race: under Istanbul coverage instrumentation the
    // per-statement/branch counters slow execution ~2-5x and drift the
    // wall-clock window, so the key could still be present at read time
    // (observed `source='redis'` instead of `'db'`). Deleting the key yields the
    // identical store-side state — a Redis miss that falls back to the service
    // (db) — with zero timing dependency, so it is stable under instrumentation.
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 30);
    await redis.del(key);
    const store = new RedisAIMonitoringStore({ redis, service: makeServiceMock() as never });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    expect(r.source).toBe('db');
  });

  it('T-I4 tamper detection: SET garbage over valid -> store rejects (source=db)', async (ctx) => {
    if (!redisReady) return ctx.skip();
    const key = __test.redisKey(RUN_TENANT, 'status');
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 30);
    await redis.set(key, '{{{not-json}}}', 'EX', 30);
    const store = new RedisAIMonitoringStore({ redis, service: makeServiceMock() as never });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    // Store MUST NOT serve garbage — JSON parse fails, falls through to DB.
    expect(r.source).toBe('db');
  });

  it('T-I5 schema-version isolation: v0-prefixed key invisible to v1 reader', async (ctx) => {
    if (!redisReady) return ctx.skip();
    const v0key = `ai-mon:v0:${RUN_TENANT}:status`;
    await redis.set(v0key, JSON.stringify(validStatusSnapshot), 'EX', 30);
    const store = new RedisAIMonitoringStore({ redis, service: makeServiceMock() as never });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    expect(r.source).toBe('db');
    await redis.del(v0key);
  });
});
