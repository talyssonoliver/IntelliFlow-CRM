/**
 * Unit tests for RedisAIMonitoringStore (IFC-214 — F4).
 *
 * Test cases (from spec §Test Plan):
 *   T-A1..T-A5: cache hit per method — getStatus / getDriftMetrics /
 *               getLatencyMetrics / getHallucinationReport / getROIMetrics
 *   T-A6  tenant isolation (write tenantA, read tenantB → source === 'db')
 *   T-A7  schema validation (poison key → source === 'db')
 *   T-A8  schema version (v0 key invisible to v1 reader)
 *   T-A9  Redis outage (redis.get throws → source === 'db')
 *   T-A10 disabled flag → always source === 'db'
 *   T-A11 cache miss (key empty) → source === 'db'
 *   T-A12 drift merge (tenant + global)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisAIMonitoringStore, type RedisLike, __test } from '../ai-monitoring.redis-store';

const TENANT_A = '01H8AAAAAAAAAAAAAAAAAAAAAA';
const TENANT_B = '01H8BBBBBBBBBBBBBBBBBBBBBB';

type FakeRedis = {
  get: ReturnType<typeof vi.fn>;
} & RedisLike;

function makeRedis(): FakeRedis {
  return { get: vi.fn().mockResolvedValue(null) as unknown as FakeRedis['get'] } as FakeRedis;
}

function makeServiceMock() {
  return {
    getStatus: vi.fn().mockResolvedValue({ source: 'real-db-status' }),
    getDriftMetrics: vi.fn().mockResolvedValue({ source: 'real-db-drift' }),
    getLatencyMetrics: vi.fn().mockResolvedValue({ source: 'real-db-latency' }),
    getHallucinationReport: vi.fn().mockResolvedValue({ source: 'real-db-hallucination' }),
    getROIMetrics: vi.fn().mockResolvedValue({ source: 'real-db-roi' }),
  } as any;
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

const validDriftSnapshot = {
  available: true,
  status: {
    trackedMetrics: 3,
    totalSamples: 3,
    driftDetected: true,
    highSeverityCount: 1,
    lastCheck: '2026-04-27T00:00:00Z',
  },
  history: [
    {
      detected: true,
      severity: 'high',
      metric: 'tenant-a-metric',
      driftScore: 0.4,
      timestamp: '2026-04-27T00:00:00Z',
    },
  ],
};

const validGlobalDriftSnapshot = {
  available: true,
  status: {
    trackedMetrics: 1,
    totalSamples: 1,
    driftDetected: false,
    highSeverityCount: 0,
    lastCheck: '2026-04-26T23:00:00Z',
  },
  history: [
    {
      detected: false,
      severity: 'none',
      metric: 'global-pca',
      driftScore: 0.05,
      timestamp: '2026-04-26T23:00:00Z',
    },
  ],
};

const validLatencySnapshot = {
  available: true,
  stats: {
    sampleCount: 100,
    successRate: 0.99,
    percentiles: {
      p50: 100,
      p75: 200,
      p90: 400,
      p95: 600,
      p99: 1200,
      max: 2000,
      min: 50,
      mean: 250,
      stdDev: 0,
    },
    sloCompliance: {
      p95Target: 2000,
      p99Target: 5000,
      p95Actual: 600,
      p99Actual: 1200,
      p95Compliant: true,
      p99Compliant: true,
      overallCompliant: true,
      complianceRate: 0.99,
    },
  },
  alerts: [],
};

const validHallucinationSnapshot = {
  available: true,
  stats: {
    totalChecks: 50,
    hallucinationsDetected: 2,
    hallucinationRate: 0.04,
    kpiCompliant: true,
  },
  recentResults: [],
};

const validROISnapshot = {
  available: true,
  roi: { totalCost: 10, totalValue: 25, netValue: 15, roi: 150 },
  stats: { totalCostsTracked: 5, totalValuesTracked: 5, currentROI: 150 },
};

describe('RedisAIMonitoringStore (IFC-214)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_MONITORING_REDIS_DISABLED;
  });

  // ----- Happy path / cache hit -----

  it('T-A1 getStatus returns source=redis when key valid', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:status` ? JSON.stringify(validStatusSnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    expect(r.value).toMatchObject({ available: true, healthy: true });
    expect(service.getStatus).not.toHaveBeenCalled();
  });

  it('T-A2 getDriftMetrics returns source=redis with merged tenant+global histories', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) => {
      if (key === `ai-mon:v1:${TENANT_A}:drift`) return JSON.stringify(validDriftSnapshot);
      if (key === `ai-mon:v1:global:drift`) return JSON.stringify(validGlobalDriftSnapshot);
      return null;
    });
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    const v = r.value as any;
    expect(v.history).toHaveLength(2);
    expect(v.status.trackedMetrics).toBe(4); // 3 + 1
    expect(service.getDriftMetrics).not.toHaveBeenCalled();
  });

  it('T-A3 getLatencyMetrics returns source=redis when key valid', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:latency` ? JSON.stringify(validLatencySnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getLatencyMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    expect(service.getLatencyMetrics).not.toHaveBeenCalled();
  });

  it('T-A4 getHallucinationReport returns source=redis when key valid', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:hallucination`
        ? JSON.stringify(validHallucinationSnapshot)
        : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getHallucinationReport({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    expect(service.getHallucinationReport).not.toHaveBeenCalled();
  });

  it('T-A5 getROIMetrics returns source=redis when key valid', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:roi` ? JSON.stringify(validROISnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getROIMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    expect(service.getROIMetrics).not.toHaveBeenCalled();
  });

  // ----- Negative paths (R-016 controls) -----

  it('T-A6 tenant isolation: write tenantA, read tenantB → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:status` ? JSON.stringify(validStatusSnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_B });
    expect(r.source).toBe('db');
    expect(service.getStatus).toHaveBeenCalledOnce();
    expect(service.getStatus).toHaveBeenCalledWith({ tenantId: TENANT_B });
  });

  it('T-A7 schema validation: poisoned key returns source=db (malformed payload acceptance = 0)', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:status` ? JSON.stringify({ evil: true }) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getStatus).toHaveBeenCalledOnce();
  });

  it('T-A7b non-JSON payload returns source=db (parse error)', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue('not-json{{{');
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
  });

  it('T-A8 schema version: v0 key invisible to v1 reader', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) => {
      // The store ONLY queries v1 keys — v0 should never be reached
      if (key === `ai-mon:v0:${TENANT_A}:status`) return JSON.stringify(validStatusSnapshot);
      return null;
    });
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    // The store never asked for the v0 key
    expect(redis.get).toHaveBeenCalledWith(`ai-mon:v1:${TENANT_A}:status`);
    expect(redis.get).not.toHaveBeenCalledWith(`ai-mon:v0:${TENANT_A}:status`);
  });

  it('T-A9 Redis outage: redis.get throws → source=db, no exception bubbles', async () => {
    const redis = makeRedis();
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getStatus).toHaveBeenCalledOnce();
  });

  it('T-A10 disabled flag: env=1 → always source=db', async () => {
    process.env.AI_MONITORING_REDIS_DISABLED = '1';
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validStatusSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('T-A10b disabled via opts: source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validStatusSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service, opts: { disabled: true } });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('T-A11 cache miss: redis returns null → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(null);
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getStatus).toHaveBeenCalledOnce();
  });

  it('T-A12 drift merge: tenant only (no global) — still source=redis with tenant history', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:drift` ? JSON.stringify(validDriftSnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    const v = r.value as any;
    expect(v.history).toHaveLength(1);
    expect(v.status.trackedMetrics).toBe(3);
  });

  it('T-A12b drift merge: global only (no tenant) — still source=redis', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:global:drift` ? JSON.stringify(validGlobalDriftSnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    const v = r.value as any;
    expect(v.history).toHaveLength(1);
  });

  it('T-A12c drift merge: both missing → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(null);
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getDriftMetrics).toHaveBeenCalledOnce();
  });

  it('null redis client: source=db', async () => {
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis: null, service });
    const r = await store.getStatus({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
  });

  // Coverage gate: each method's db-fallback arrow needs to fire under disabled
  it('disabled: getDriftMetrics → db', async () => {
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis: null, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getDriftMetrics).toHaveBeenCalledOnce();
  });

  it('disabled: getLatencyMetrics → db', async () => {
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis: null, service });
    const r = await store.getLatencyMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getLatencyMetrics).toHaveBeenCalledOnce();
  });

  it('disabled: getHallucinationReport → db', async () => {
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis: null, service });
    const r = await store.getHallucinationReport({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getHallucinationReport).toHaveBeenCalledOnce();
  });

  it('disabled: getROIMetrics → db', async () => {
    const service = makeServiceMock();
    const store = new RedisAIMonitoringStore({ redis: null, service });
    const r = await store.getROIMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('db');
    expect(service.getROIMetrics).toHaveBeenCalledOnce();
  });

  // ----- Schema sanity (Cat. EE/PG-186 — real assertions, not placeholder) -----

  it('Zod schemas reject the empty object', () => {
    expect(__test.schemas.status.safeParse({}).success).toBe(false);
    expect(__test.schemas.drift.safeParse({}).success).toBe(false);
    expect(__test.schemas.latency.safeParse({}).success).toBe(false);
    expect(__test.schemas.hallucination.safeParse({}).success).toBe(false);
    expect(__test.schemas.roi.safeParse({}).success).toBe(false);
  });

  it('Zod schemas accept their respective valid shapes', () => {
    expect(__test.schemas.status.safeParse(validStatusSnapshot).success).toBe(true);
    expect(__test.schemas.drift.safeParse(validDriftSnapshot).success).toBe(true);
    expect(__test.schemas.latency.safeParse(validLatencySnapshot).success).toBe(true);
    expect(__test.schemas.hallucination.safeParse(validHallucinationSnapshot).success).toBe(true);
    expect(__test.schemas.roi.safeParse(validROISnapshot).success).toBe(true);
  });

  it('redisKey helper: deterministic format, tenant-only namespacing', () => {
    expect(__test.redisKey(TENANT_A, 'status')).toBe(`ai-mon:v1:${TENANT_A}:status`);
    expect(__test.redisKey(TENANT_A, 'drift')).toBe(`ai-mon:v1:${TENANT_A}:drift`);
  });

  // -----------------------------------------------------------------------------
  // Filter-bypass tests (Lens-1 audit finding #1) — the publisher precomputes one
  // unfiltered 24h aggregate per (tenant, kind). Returning that snapshot to a
  // request that supplies startTime/endTime/limit/model/metric would lie about
  // query semantics. These tests assert the store goes to DB on every filter.
  // -----------------------------------------------------------------------------

  it('Lens-1 filter bypass: getDriftMetrics with limit → source=db (cache ignored)', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validDriftSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A, limit: 20 });
    expect(r.source).toBe('db');
    expect(service.getDriftMetrics).toHaveBeenCalledOnce();
    expect(service.getDriftMetrics).toHaveBeenCalledWith({ tenantId: TENANT_A, limit: 20 });
    // Crucially: redis.get was NOT called — we didn't even ask the cache.
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getDriftMetrics with startTime → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validDriftSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({
      tenantId: TENANT_A,
      startTime: new Date('2026-04-27T00:00:00Z'),
    });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getDriftMetrics with endTime → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validDriftSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({
      tenantId: TENANT_A,
      endTime: new Date('2026-04-27T00:00:00Z'),
    });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getDriftMetrics with model → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validDriftSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A, model: 'gpt-4' });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getDriftMetrics with metric → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validDriftSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A, metric: 'score_distribution' });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getLatencyMetrics with startTime → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validLatencySnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getLatencyMetrics({
      tenantId: TENANT_A,
      startTime: new Date('2026-04-27T00:00:00Z'),
    });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getLatencyMetrics with model → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validLatencySnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getLatencyMetrics({ tenantId: TENANT_A, model: 'gpt-4' });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getHallucinationReport with limit → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validHallucinationSnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getHallucinationReport({ tenantId: TENANT_A, limit: 50 });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 filter bypass: getROIMetrics with startTime → source=db', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockResolvedValue(JSON.stringify(validROISnapshot));
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getROIMetrics({
      tenantId: TENANT_A,
      startTime: new Date('2026-04-27T00:00:00Z'),
    });
    expect(r.source).toBe('db');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('Lens-1 cache eligible: getDriftMetrics with NO filters → source=redis', async () => {
    const redis = makeRedis();
    const service = makeServiceMock();
    redis.get.mockImplementation(async (key: string) =>
      key === `ai-mon:v1:${TENANT_A}:drift` ? JSON.stringify(validDriftSnapshot) : null
    );
    const store = new RedisAIMonitoringStore({ redis, service });
    const r = await store.getDriftMetrics({ tenantId: TENANT_A });
    expect(r.source).toBe('redis');
    expect(service.getDriftMetrics).not.toHaveBeenCalled();
  });
});
