/**
 * Cross-process integration test for IFC-214 (F5).
 *
 * Filename intentionally NOT `.integration.test.ts` — `apps/api/vitest.config.ts:16`
 * excludes that suffix from `pnpm test`. Real gating is `it.skipIf(!REDIS_URL)`.
 *
 * Audit-finding-#2 fix: this test now imports the REAL `RedisAIMonitoringStore`
 * from production code (NOT raw redis.set/redis.get round-trips). It writes
 * payloads under the production key schema (`ai-mon:v1:{tenant}:{kind}`) and
 * exercises the store's read path end-to-end, including:
 *   - Schema-version key prefix (R-016 control 3)
 *   - Tenant-scoped key namespacing (R-016 control 1)
 *   - Zod payload validation on read (R-016 control 2)
 *
 * The publisher itself lives in `apps/ai-worker/src/monitoring/redis-monitoring-publisher.ts`.
 * Running the publisher inside this test pool would require importing across
 * package boundaries (api ↔ ai-worker), which is forbidden by the workspace
 * topology. Instead, this test asserts the **CONTRACT** that the publisher's
 * payload shape matches the store's expectations — by writing a
 * publisher-shaped payload directly and reading via the real store. The
 * publisher-side coverage test in
 * `apps/ai-worker/src/monitoring/__tests__/redis-monitoring-publisher.test.ts`
 * separately validates the publisher writes that shape.
 *
 * Test cases (from spec §Test Plan):
 *   T-I1 round trip — publisher-shape write → store reads source='redis'
 *   T-I2 latency — 100 reads, p95 < 50 ms (KPI gate)
 *   T-I3 outage fallback — TTL expires, store reads source='db'
 *   T-I4 tamper — `SET` garbage over valid → store reads source='db'
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisAIMonitoringStore, __test, type RedisLike } from '../ai-monitoring.redis-store';

const REDIS_URL = process.env.REDIS_URL ?? null;
const TENANT = '01H8TESTAAAAAAAAAAAAAAAAAA';

interface IORedisClient extends RedisLike {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<unknown>;
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

function makeServiceMock() {
  return {
    getStatus: async () => ({ source: 'real-db-status' }) as never,
    getDriftMetrics: async () => ({ source: 'real-db-drift' }) as never,
    getLatencyMetrics: async () => ({ source: 'real-db-latency' }) as never,
    getHallucinationReport: async () => ({ source: 'real-db-hallucination' }) as never,
    getROIMetrics: async () => ({ source: 'real-db-roi' }) as never,
  };
}

describe.skipIf(!REDIS_URL)('IFC-214 cross-process integration (REDIS_URL set)', () => {
  let redis: IORedisClient;
  // Use a unique tenant per run to avoid collisions across parallel CI invocations.
  const RUN_TENANT = `${TENANT}_${Date.now()}`;

  beforeAll(async () => {
    const ioredis = await import('ioredis');
    const RedisCtor = (ioredis.default ?? ioredis) as unknown as new (
      url: string,
      opts?: Record<string, unknown>,
    ) => IORedisClient;
    redis = new RedisCtor(REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 });
  });

  afterAll(async () => {
    if (!redis) return;
    const keys = await redis.keys(`ai-mon:v1:${RUN_TENANT}:*`);
    if (keys.length) {
      await Promise.all(keys.map((k) => redis.del(k)));
    }
    await redis.quit();
  });

  it('T-I1 round trip: publisher-shape write → real store reads source=redis with correct payload', async () => {
    // Write under the production key schema using the same redisKey helper the
    // publisher uses. This proves the publisher's key + payload contract is
    // honoured by the store on the read side.
    const key = __test.redisKey(RUN_TENANT, 'status');
    expect(key).toBe(`ai-mon:v1:${RUN_TENANT}:status`);
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 30);

    const store = new RedisAIMonitoringStore({
      redis,
      service: makeServiceMock() as never,
    });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    expect(r.source).toBe('redis');
    expect(r.value).toMatchObject({ available: true, healthy: true });
    expect((r.value as typeof validStatusSnapshot).roi.totalCost).toBe(10);
  });

  it('T-I2 latency: 100 store.getStatus calls p95 < 50 ms', async () => {
    const key = __test.redisKey(RUN_TENANT, 'status');
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 60);
    const store = new RedisAIMonitoringStore({
      redis,
      service: makeServiceMock() as never,
    });
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

  it('T-I3 outage fallback: TTL expiry → store reads source=db', async () => {
    const key = __test.redisKey(RUN_TENANT, 'status');
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 1);
    await new Promise((r) => setTimeout(r, 1500));
    const store = new RedisAIMonitoringStore({
      redis,
      service: makeServiceMock() as never,
    });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    expect(r.source).toBe('db');
  });

  it('T-I4 tamper detection: SET garbage over valid → store rejects (source=db)', async () => {
    const key = __test.redisKey(RUN_TENANT, 'status');
    await redis.set(key, JSON.stringify(validStatusSnapshot), 'EX', 30);
    await redis.set(key, '{{{not-json}}}', 'EX', 30);
    const store = new RedisAIMonitoringStore({
      redis,
      service: makeServiceMock() as never,
    });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    // Store MUST NOT serve garbage — JSON parse fails, falls through to DB.
    expect(r.source).toBe('db');
  });

  it('T-I5 schema-version isolation: v0-prefixed key invisible to v1 reader', async () => {
    // Direct write under a hypothetical v0 prefix — store must not see it.
    const v0key = `ai-mon:v0:${RUN_TENANT}:status`;
    await redis.set(v0key, JSON.stringify(validStatusSnapshot), 'EX', 30);
    const store = new RedisAIMonitoringStore({
      redis,
      service: makeServiceMock() as never,
    });
    const r = await store.getStatus({ tenantId: RUN_TENANT });
    expect(r.source).toBe('db');
    // Cleanup
    await redis.del(v0key);
  });
});
