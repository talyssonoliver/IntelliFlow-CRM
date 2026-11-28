/**
 * @vitest-environment node
 *
 * Unit tests for RedisMonitoringPublisher (IFC-214 — F2).
 *
 * Test cases (from spec §Test Plan):
 *   T-W1 happy path — 5 snapshot keys per tenant, correct TTL, payload structure
 *   T-W2 disabled  — never calls redis.set
 *   T-W3 outage    — redis.set throws → caught, logged, returns skipped
 *   T-W4 schema-version key prefix `ai-mon:v1:`
 *   T-W5 global drift writes to ai-mon:v1:global:drift only
 *   T-W6 lifecycle — start/stop with fake timers
 *   T-W7 publish cadence — fake timer advance produces expected tick count
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisMonitoringPublisher, redisKey, type RedisLike } from '../redis-monitoring-publisher';

const TENANT_A = '01H8AAAAAAAAAAAAAAAAAAAAAA';
const TENANT_B = '01H8BBBBBBBBBBBBBBBBBBBBBB';

interface FakeRedis extends RedisLike {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

function makeRedis(): FakeRedis {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    quit: vi.fn().mockResolvedValue('OK'),
  } as FakeRedis;
}

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

/**
 * Build a Prisma stub that handles the distinct-tenants probe (returns
 * `[{ tenantId }, ...]`), the per-tenant row fetch (returns events filtered
 * by where.tenantId) and the latency/ROI aggregate query (`$queryRaw`, which
 * Postgres answers in production; here the same rules run over the fixture).
 * The real SQL is held equal to the old Node computation by
 * tests/integration/ai-monitoring-publisher-sql.test.ts.
 */
function makePrismaWithEvents(events: FixtureEvent[]) {
  const findMany = vi.fn(async (args: any) => {
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
    const types: string[] | undefined = args?.where?.eventType?.in;
    const slim = args?.select && !args.select.payload;
    return events
      .filter((e) => e.tenantId === want && (!types || types.includes(e.eventType)))
      .map((e) => (slim ? { ...e, payload: undefined } : e));
  });
  const aggregate = vi.fn(async () => ({
    _count: { _all: events.length },
    _max: {
      recordedAt: events.length ? new Date(Math.max(...events.map((e) => +e.recordedAt))) : null,
    },
  }));
  // $queryRaw(strings, since, tenantId, tenantId, cap, cap): one row of latency/ROI aggregates.
  const queryRaw = vi.fn(async (_strings: unknown, ...values: unknown[]) => {
    const tenant = values[1] as string | null;
    const cap = values[values.length - 1] as number;
    const win = events
      .filter((e) => e.tenantId === tenant)
      .sort((x, y) => +y.recordedAt - +x.recordedAt)
      .slice(0, cap);
    const lat = win.filter((e) => e.eventType === 'latency');
    const v = lat.map((e) => e.value ?? 0).sort((a, b) => a - b);
    const at = (p: number) => v[Math.ceil((v.length * p) / 100) - 1] ?? null;
    const sum = (t: string) =>
      win.filter((e) => e.eventType === t).reduce((s, e) => s + (e.value ?? 0), 0);
    const count = (t: string) => win.filter((e) => e.eventType === t).length;
    return [
      {
        n: lat.length || null,
        ok: lat.length ? lat.filter((e) => !e.flagged).length : null,
        mean: lat.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
        min: lat.length ? v[0] : null,
        max: lat.length ? v[v.length - 1] : null,
        p50: at(50),
        p75: at(75),
        p90: at(90),
        p95: at(95),
        p99: at(99),
        oldest: lat.length ? new Date(Math.min(...lat.map((e) => +e.recordedAt))) : null,
        newest: lat.length ? new Date(Math.max(...lat.map((e) => +e.recordedAt))) : null,
        cost_n: count('roi_cost'),
        cost_sum: sum('roi_cost'),
        value_n: count('roi_value'),
        value_sum: sum('roi_value'),
        cutoff: null,
      },
    ];
  });
  return { aIMonitoringEvent: { findMany, aggregate }, $queryRaw: queryRaw } as any;
}

const baseEvent = (over: Record<string, unknown>) => ({
  tenantId: TENANT_A,
  recordedAt: new Date('2026-04-27T00:00:00Z'),
  value: 0,
  flagged: false,
  severity: null,
  metric: null,
  model: null,
  payload: null,
  ...over,
});

describe('RedisMonitoringPublisher (IFC-214)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('T-W1 happy path: writes 5 snapshot keys per tenant with correct TTL', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({ eventType: 'drift', flagged: true, severity: 'high', metric: 'score' }),
      baseEvent({ eventType: 'latency', value: 1500, flagged: false }),
      baseEvent({ eventType: 'hallucination', flagged: false, value: 0.1 }),
      baseEvent({ eventType: 'roi_cost', value: 5 }),
      baseEvent({ eventType: 'roi_value', value: 12 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma, {
      ttlSeconds: 30,
      intervalMs: 5000,
    });

    const result = await pub.tick();

    // 5 kinds × 1 tenant = 5 writes
    expect(result).toEqual({ written: 5, skipped: 0 });
    expect(redis.set).toHaveBeenCalledTimes(5);
    const keys = redis.set.mock.calls.map((c) => c[0] as string).sort();
    expect(keys).toEqual([
      `ai-mon:v1:${TENANT_A}:drift`,
      `ai-mon:v1:${TENANT_A}:hallucination`,
      `ai-mon:v1:${TENANT_A}:latency`,
      `ai-mon:v1:${TENANT_A}:roi`,
      `ai-mon:v1:${TENANT_A}:status`,
    ]);
    // TTL on every call
    for (const call of redis.set.mock.calls) {
      expect(call[2]).toBe('EX');
      expect(call[3]).toBe(30);
    }
    // Snapshot payload shape — status snapshot is JSON-parseable
    const statusCall = redis.set.mock.calls.find((c) => (c[0] as string).endsWith(':status'));
    const statusPayload = JSON.parse(statusCall![1] as string);
    expect(statusPayload).toMatchObject({
      available: true,
      drift: expect.any(Object),
      latency: expect.any(Object),
      hallucination: expect.any(Object),
      roi: expect.any(Object),
    });
  });

  it('T-W2 disabled flag: never calls redis.set, returns zeros', async () => {
    const redis = makeRedis();
    const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
    const pub = new RedisMonitoringPublisher(redis, prisma, { disabled: true });
    const result = await pub.tick();
    expect(result).toEqual({ written: 0, skipped: 0 });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('T-W3 Redis outage: redis.set throws → caught, returns skipped > 0', async () => {
    const redis = makeRedis();
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const events = [
      baseEvent({ eventType: 'drift', flagged: true }),
      baseEvent({ eventType: 'latency', value: 200 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);

    const result = await pub.tick();
    // 5 attempts (5 kinds × 1 tenant), all skipped
    expect(result.written).toBe(0);
    expect(result.skipped).toBe(5);
    // Crucially: tick() did not throw
  });

  it('T-W4 schema-version prefix: every key begins with ai-mon:v1:', async () => {
    const redis = makeRedis();
    const events = [baseEvent({ eventType: 'latency', value: 100 })];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await pub.tick();
    for (const call of redis.set.mock.calls) {
      const key = call[0] as string;
      expect(key.startsWith('ai-mon:v1:')).toBe(true);
    }
  });

  it('T-W5 global drift: tenantId=null events go to ai-mon:v1:global:drift only (not other kinds)', async () => {
    const redis = makeRedis();
    // Two events: one global drift, one tenant-A latency
    const events = [
      baseEvent({ tenantId: null, eventType: 'drift', flagged: true, metric: 'global-pca' }),
      baseEvent({ tenantId: TENANT_A, eventType: 'latency', value: 300 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await pub.tick();

    const keys = redis.set.mock.calls.map((c) => c[0] as string).sort();
    // Tenant A: 5 snapshots; Global namespace: ONLY drift (not status/latency/hallucination/roi)
    expect(keys).toContain('ai-mon:v1:global:drift');
    expect(keys).not.toContain('ai-mon:v1:global:status');
    expect(keys).not.toContain('ai-mon:v1:global:latency');
    expect(keys).not.toContain('ai-mon:v1:global:hallucination');
    expect(keys).not.toContain('ai-mon:v1:global:roi');
    // Tenant A still gets all 5
    expect(keys.filter((k) => k.includes(TENANT_A))).toHaveLength(5);
  });

  it('T-W6 lifecycle: start() schedules; stop() clears + final-flush + quit', async () => {
    const redis = makeRedis();
    const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 50 })]);
    const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 1000 });

    pub.start();
    // start does not run a tick immediately; only on the timer fire
    expect(redis.set).not.toHaveBeenCalled();

    await pub.stop();
    // stop ran a final tick
    expect(redis.set).toHaveBeenCalled();
    expect(redis.quit).toHaveBeenCalled();

    // After stop the timer is cleared — advance time and observe no new calls
    const setCallsBefore = redis.set.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(redis.set.mock.calls.length).toBe(setCallsBefore);
  });

  it('T-W7 publish cadence: 12s elapsed at 5s interval → 2 ticks fired', async () => {
    const redis = makeRedis();
    const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
    const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 5000 });
    pub.start();
    // Each tick → 5 set calls (1 tenant × 5 kinds)
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(2000); // total 12s
    // 2 ticks fired (2 marker probes); the data never changed, so only the
    // first one published (5 set calls = 1 tenant x 5 kinds).
    expect(prisma.aIMonitoringEvent.aggregate).toHaveBeenCalledTimes(2);
    expect(redis.set.mock.calls.length).toBe(5);
    await pub.stop();
  });

  it('redisKey helper: deterministic format', () => {
    expect(redisKey(TENANT_A, 'status')).toBe(`ai-mon:v1:${TENANT_A}:status`);
    expect(redisKey('global', 'drift')).toBe('ai-mon:v1:global:drift');
  });

  it('start() is no-op when disabled', () => {
    const redis = makeRedis();
    const prisma = makePrismaWithEvents([]);
    const pub = new RedisMonitoringPublisher(redis, prisma, { disabled: true });
    pub.start();
    vi.advanceTimersByTime(20_000);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('null redis client treated as disabled', async () => {
    const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
    const pub = new RedisMonitoringPublisher(null, prisma);
    const result = await pub.tick();
    expect(result).toEqual({ written: 0, skipped: 0 });
  });

  it('coverage: rich-payload events exercise pickField paths', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({
        eventType: 'drift',
        flagged: true,
        severity: 'critical',
        metric: 'rich-metric',
        value: 0.5,
        payload: {
          pValue: 0.01,
          baselineWindow: { start: '2026-04-26', end: '2026-04-27' },
          currentWindow: { start: '2026-04-27', end: '2026-04-28' },
          recommendations: ['retrain', 'investigate'],
        },
      }),
      baseEvent({
        eventType: 'hallucination',
        flagged: true,
        value: 0.9,
        payload: {
          confidence: 0.85,
          hallucinationTypes: ['fabrication', 'contradiction'],
          evidence: [{ source: 'kb', text: 'test' }],
          groundTruthSources: ['doc-1'],
        },
      }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    const result = await pub.tick();
    expect(result.written).toBe(5);
    const driftCall = redis.set.mock.calls.find((c) => (c[0] as string).endsWith(':drift'));
    const driftPayload = JSON.parse(driftCall![1] as string);
    expect(driftPayload.history[0]).toMatchObject({
      severity: 'critical',
      pValue: 0.01,
      recommendations: ['retrain', 'investigate'],
    });
  });

  it('coverage: empty latency events → emptyLatencyStats branch', async () => {
    const redis = makeRedis();
    // Only drift event, no latency — exercises empty-latency code path
    const events = [baseEvent({ eventType: 'drift', flagged: false })];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    const result = await pub.tick();
    expect(result.written).toBe(5);
    const latencyCall = redis.set.mock.calls.find((c) => (c[0] as string).endsWith(':latency'));
    const latencyPayload = JSON.parse(latencyCall![1] as string);
    expect(latencyPayload.stats.sampleCount).toBe(0);
    expect(latencyPayload.stats.sloCompliance.overallCompliant).toBe(true);
  });

  it('coverage: high-rate hallucination triggers issues array', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({ eventType: 'hallucination', flagged: true, value: 0.5 }),
      baseEvent({ eventType: 'hallucination', flagged: true, value: 0.5 }),
      baseEvent({ eventType: 'hallucination', flagged: false, value: 0.1 }),
      baseEvent({ eventType: 'drift', flagged: true, severity: 'high' }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await pub.tick();
    const statusCall = redis.set.mock.calls.find((c) => (c[0] as string).endsWith(':status'));
    const statusPayload = JSON.parse(statusCall![1] as string);
    expect(statusPayload.healthy).toBe(false);
    expect(statusPayload.issues.length).toBeGreaterThan(0);
  });

  it('coverage: periodic tick error path (logger.warn)', async () => {
    const redis = makeRedis();
    // findMany throws → tick() rejects; the periodic timer callback logs the warn.
    const prisma = {
      aIMonitoringEvent: {
        findMany: vi.fn().mockRejectedValue(new Error('db down')),
      },
    } as any;
    const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 1000 });
    pub.start();
    // Advance timer to trigger the failing tick
    await vi.advanceTimersByTimeAsync(1500);
    // After failure, stop should still run cleanly
    await pub.stop();
    // No assertion about the warn log — just that the coverage path executes
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('coverage: stop() final-tick error path swallowed', async () => {
    const redis = makeRedis();
    // Final flush during stop fails — should not throw
    const prisma = {
      aIMonitoringEvent: {
        findMany: vi.fn().mockRejectedValue(new Error('db error during shutdown')),
      },
    } as any;
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await expect(pub.stop()).resolves.toBeUndefined();
  });

  it('coverage: double-start is a no-op (does not duplicate the timer)', async () => {
    const redis = makeRedis();
    const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
    const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 1000 });
    pub.start();
    pub.start(); // second start hits the `if (this.timer) return;` guard
    // Real invariant: ONE tick fires per interval, not two (no duplicate timer).
    await vi.advanceTimersByTimeAsync(1000);
    expect(redis.set).toHaveBeenCalledTimes(5); // 1 tenant × 5 kinds × ONE tick
    await pub.stop();
  });

  it('coverage: ROI snapshot with cost/value events', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({ eventType: 'roi_cost', value: 100 }),
      baseEvent({ eventType: 'roi_cost', value: 50 }),
      baseEvent({ eventType: 'roi_value', value: 300 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await pub.tick();
    const roiCall = redis.set.mock.calls.find((c) => (c[0] as string).endsWith(':roi'));
    const roi = JSON.parse(roiCall![1] as string);
    expect(roi.roi.totalCost).toBe(150);
    expect(roi.roi.totalValue).toBe(300);
    expect(roi.roi.roi).toBe(100); // (300-150)/150 * 100
    expect(roi.stats.totalCostsTracked).toBe(2);
  });

  it('Lens-5 per-tenant fetch: distinct tenants are queried separately (not one global findMany)', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({ tenantId: TENANT_A, eventType: 'latency', value: 100 }),
      baseEvent({ tenantId: TENANT_B, eventType: 'latency', value: 200 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    await pub.tick();

    const findMany = prisma.aIMonitoringEvent.findMany;
    const calls = findMany.mock.calls.map((c: any[]) => c[0]);
    // First call is the distinct-tenants probe
    expect(calls.some((arg: any) => arg.distinct?.[0] === 'tenantId')).toBe(true);
    // Subsequent calls are per-tenant
    const perTenantCalls = calls.filter((arg: any) => !arg.distinct);
    const tenantsQueried = perTenantCalls.map((arg: any) => arg.where?.tenantId);
    expect(tenantsQueried).toContain(TENANT_A);
    expect(tenantsQueried).toContain(TENANT_B);
  });

  it('multiple tenants: writes 5 keys × N tenants', async () => {
    const redis = makeRedis();
    const events = [
      baseEvent({ tenantId: TENANT_A, eventType: 'latency', value: 100 }),
      baseEvent({ tenantId: TENANT_B, eventType: 'latency', value: 200 }),
    ];
    const prisma = makePrismaWithEvents(events);
    const pub = new RedisMonitoringPublisher(redis, prisma);
    const result = await pub.tick();
    expect(result.written).toBe(10); // 2 tenants × 5 kinds
  });
  describe('cadence defaults (idle query load)', () => {
    const savedInterval = process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS;
    const savedTtl = process.env.AI_MONITORING_REDIS_TTL_SECONDS;

    beforeEach(() => {
      delete process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS;
      delete process.env.AI_MONITORING_REDIS_TTL_SECONDS;
    });

    afterEach(() => {
      if (savedInterval === undefined) delete process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS;
      else process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS = savedInterval;
      if (savedTtl === undefined) delete process.env.AI_MONITORING_REDIS_TTL_SECONDS;
      else process.env.AI_MONITORING_REDIS_TTL_SECONDS = savedTtl;
    });

    it('publishes every 5 min by default, not every 5s', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma);
      pub.start();

      await vi.advanceTimersByTimeAsync(299_000);
      expect(redis.set).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(redis.set.mock.calls.length).toBe(5); // one tick: 1 tenant x 5 kinds
      await pub.stop();
    });

    it('defaults the TTL to 6x the cadence (1800s at 5 min)', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma);

      await pub.tick();

      for (const call of redis.set.mock.calls) expect(call[3]).toBe(1800);
    });

    it('keeps the env override for the interval, and the TTL follows it', async () => {
      process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS = '5000';
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma);
      pub.start();

      await vi.advanceTimersByTimeAsync(5_000);
      expect(redis.set.mock.calls.length).toBe(5);
      for (const call of redis.set.mock.calls) expect(call[3]).toBe(30);
      await pub.stop();
    });

    it('keeps an explicit TTL env override', async () => {
      process.env.AI_MONITORING_REDIS_TTL_SECONDS = '900';
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma);

      await pub.tick();

      for (const call of redis.set.mock.calls) expect(call[3]).toBe(900);
    });
  });

  describe('egress: skip unchanged, slim columns', () => {
    const rowReads = (prisma: any) =>
      prisma.aIMonitoringEvent.findMany.mock.calls.filter((c: any[]) => !c[0].distinct).length;

    it('unchanged table: second tick reads 0 rows and writes nothing', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 300_000 });
      await pub.tick();
      const readsAfterFirst = rowReads(prisma);
      const setsAfterFirst = redis.set.mock.calls.length;
      expect(readsAfterFirst).toBeGreaterThan(0);

      vi.advanceTimersByTime(300_000);
      const second = await pub.tick();

      expect(second).toEqual({ written: 0, skipped: 0 });
      expect(rowReads(prisma)).toBe(readsAfterFirst);
      expect(redis.set.mock.calls.length).toBe(setsAfterFirst);
    });

    it('a new event triggers exactly one more publish', async () => {
      const redis = makeRedis();
      const events = [baseEvent({ eventType: 'latency', value: 100 })];
      const prisma = makePrismaWithEvents(events);
      const pub = new RedisMonitoringPublisher(redis, prisma, { intervalMs: 300_000 });
      await pub.tick();
      events.push(
        baseEvent({
          eventType: 'latency',
          value: 200,
          recordedAt: new Date('2026-04-27T00:01:00Z'),
        })
      );
      const r = await pub.tick();
      expect(r.written).toBe(5);
      expect((await pub.tick()).written).toBe(0);
    });

    it('extends the TTL before it runs out without reading any rows', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma, {
        intervalMs: 300_000,
        ttlSeconds: 1800,
      });
      await pub.tick();
      const reads = rowReads(prisma);
      vi.advanceTimersByTime(899_000);
      expect((await pub.tick()).written).toBe(0);
      vi.advanceTimersByTime(2_000); // past half of the 1800 s TTL
      expect((await pub.tick()).written).toBe(5);
      expect(rowReads(prisma)).toBe(reads);
    });

    it('a failed redis write is retried with a full read on the next tick', async () => {
      const redis = makeRedis();
      redis.set.mockRejectedValueOnce(new Error('redis down'));
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      const pub = new RedisMonitoringPublisher(redis, prisma);
      expect((await pub.tick()).skipped).toBe(1);
      expect((await pub.tick()).written).toBe(5);
    });

    it('reads rows only for drift/hallucination; latency and ROI come back as one aggregate row', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([baseEvent({ eventType: 'latency', value: 100 })]);
      await new RedisMonitoringPublisher(redis, prisma).tick();
      const perTenant = prisma.aIMonitoringEvent.findMany.mock.calls
        .map((c: any[]) => c[0])
        .filter((a: any) => !a.distinct);
      // One row read per tenant, with payload, and no latency / roi type is ever read as rows.
      expect(perTenant).toHaveLength(1);
      expect(perTenant[0].select.payload).toBe(true);
      expect(perTenant[0].where.eventType.in).toEqual(['drift', 'hallucination']);
      // The aggregate query ran once for that tenant.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.calls[0][2]).toBe(TENANT_A);
    });

    it('the global namespace reads drift rows only (it publishes no other kind)', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([
        baseEvent({ tenantId: null, eventType: 'drift', flagged: true }),
        baseEvent({ tenantId: null, eventType: 'hallucination' }),
      ]);
      await new RedisMonitoringPublisher(redis, prisma).tick();
      const perTenant = prisma.aIMonitoringEvent.findMany.mock.calls
        .map((c: any[]) => c[0])
        .filter((a: any) => !a.distinct);
      expect(perTenant).toHaveLength(1);
      expect(perTenant[0].where.tenantId).toBeNull();
      expect(perTenant[0].where.eventType.in).toEqual(['drift']);
    });

    it('latency and ROI snapshots are built from the aggregate row', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([
        baseEvent({ eventType: 'latency', value: 100, flagged: false }),
        baseEvent({ eventType: 'latency', value: 300, flagged: true }),
        baseEvent({ eventType: 'latency', value: 5000, flagged: false }),
        baseEvent({ eventType: 'roi_cost', value: 10 }),
        baseEvent({ eventType: 'roi_value', value: 25 }),
      ]);
      await new RedisMonitoringPublisher(redis, prisma).tick();
      const get = (k: string) =>
        JSON.parse(redis.set.mock.calls.find((c) => (c[0] as string).endsWith(k))![1] as string);
      const lat = get(':latency').stats;
      expect(lat.sampleCount).toBe(3);
      expect(lat.successRate).toBeCloseTo(2 / 3, 12);
      expect(lat.percentiles).toMatchObject({
        p50: 300,
        p95: 5000,
        p99: 5000,
        min: 100,
        max: 5000,
      });
      expect(lat.sloCompliance.overallCompliant).toBe(false);
      expect(get(':status').latency).toMatchObject({ sloCompliant: false, p95: 5000 });
      expect(get(':roi').roi).toMatchObject({ totalCost: 10, totalValue: 25, roi: 150 });
    });

    it('snapshot payloads keep drift/hallucination payload fields', async () => {
      const redis = makeRedis();
      const prisma = makePrismaWithEvents([
        baseEvent({ eventType: 'drift', flagged: true, payload: { pValue: 0.01 } }),
        baseEvent({ eventType: 'hallucination', payload: { confidence: 0.9 } }),
      ]);
      await new RedisMonitoringPublisher(redis, prisma).tick();
      const get = (k: string) =>
        JSON.parse(redis.set.mock.calls.find((c) => (c[0] as string).endsWith(k))![1] as string);
      expect(get(':drift').history[0].pValue).toBe(0.01);
      expect(get(':hallucination').recentResults[0].confidence).toBe(0.9);
    });
  });
});
