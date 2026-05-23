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
 * Build a Prisma stub that handles BOTH the distinct-tenants probe (returns
 * `[{ tenantId }, ...]`) and the per-tenant fetch (returns events filtered
 * by where.tenantId).
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
    return events.filter((e) => e.tenantId === want);
  });
  return { aIMonitoringEvent: { findMany } } as any;
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
    // 2 ticks completed
    expect(redis.set.mock.calls.length).toBe(10);
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
});
