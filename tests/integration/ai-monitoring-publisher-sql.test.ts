/**
 * The monitoring snapshot publisher computes latency and ROI in SQL (IFC-117, egress audit 1126).
 *
 * `RedisMonitoringPublisher` used to read every latency / roi_cost / roi_value row of every
 * tenant into Node and aggregate there; measured on prod on 27/11/2026 that was ~190 rows
 * (~52 KB) per call of the combined worker's `AIMonitoringEvent.findMany`. It now asks Postgres
 * for the aggregates and reads only the drift and hallucination rows that the snapshots list.
 *
 * This suite seeds several tenants, models and time windows into a real database, inside a
 * transaction that always rolls back, then runs BOTH publishers on the same rows:
 *
 *   - `LegacyRedisMonitoringPublisher` (tests/integration/helpers) is the previous code;
 *   - `RedisMonitoringPublisher` is the new one.
 *
 * Every Redis key and every snapshot must be equal: same keys, same JSON, with numbers compared
 * to 9 decimal places (SQL and JS add floating-point numbers in a different order). A second
 * block proves the rows that leave the database no longer follow the event volume.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { assertTestDatabaseUrl } from './db-url-guard';
import { measureResult } from '../../packages/db/src/egress-meter';
import { RedisMonitoringPublisher } from '../../apps/ai-worker/src/monitoring/redis-monitoring-publisher';
import { LegacyRedisMonitoringPublisher } from './helpers/legacy-redis-monitoring-publisher';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

class Rollback extends Error {}

const MIN = 60_000;
const LOOKBACK_MS = 24 * 60 * MIN;
/** A fixed, whole-millisecond "now" so both publishers (and the seed) share one clock. */
const NOW = Date.UTC(2026, 10, 28, 12, 0, 0, 0);

interface Seed {
  tenant: 'a' | 'b' | 'c' | 'd' | 'e' | 'global';
  eventType: string;
  value?: number | null;
  flagged?: boolean | null;
  severity?: string | null;
  model?: string | null;
  metric?: string | null;
  /** Minutes before NOW. Unique per tenant, so the order of events never depends on ties. */
  minutesAgo: number;
  payload?: unknown;
}

// Values repeat on purpose (ties), include nulls (counted as 0) and flagged = null / false / true.
const LATENCY_VALUES = [
  120,
  80,
  80,
  95,
  4000,
  150,
  null,
  2200,
  300,
  300,
  300,
  75,
  6100,
  210,
  90,
  85,
  1999,
  2000,
  2001,
  500,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
];
const MODELS = ['gpt-4o', 'claude-sonnet', 'llama-3', null];

function flagFor(i: number): boolean | null {
  if (i % 7 === 0) return true;
  if (i % 5 === 0) return null;
  return false;
}

function seedTenantA(seeds: Seed[]): void {
  // Tenant A: every kind, several models, spread over the whole window.
  LATENCY_VALUES.forEach((value, i) =>
    seeds.push({
      tenant: 'a',
      eventType: 'latency',
      value,
      flagged: flagFor(i),
      model: MODELS[i % MODELS.length] ?? null,
      metric: i % 2 ? 'chat' : 'embed',
      minutesAgo: 3 + i * 31,
    })
  );
  for (let i = 0; i < 9; i++) {
    seeds.push({
      tenant: 'a',
      eventType: 'hallucination',
      value: i / 10,
      flagged: i % 3 === 0,
      model: MODELS[i % 3],
      minutesAgo: 17 + i * 97,
      payload: { id: `h${i}`, confidence: 0.5 + i / 20, hallucinationTypes: ['x'], evidence: [i] },
    });
  }
  const sev = ['high', 'low', 'critical', 'medium', 'none'];
  for (let i = 0; i < 6; i++) {
    seeds.push({
      tenant: 'a',
      eventType: 'drift',
      value: 0.1 * i,
      flagged: i % 2 === 0,
      severity: sev[i % sev.length],
      metric: i % 2 ? 'psi' : null,
      model: i % 2 ? null : 'gpt-4o',
      minutesAgo: 41 + i * 211,
      payload: i % 2 ? { pValue: 0.01 * i, recommendations: ['retrain'] } : null,
    });
  }
  [0.012, 0.5, 1.25, null, 0.003, 2.5].forEach((value, i) =>
    seeds.push({ tenant: 'a', eventType: 'roi_cost', value, minutesAgo: 23 + i * 140 })
  );
  [3.1, 0.7, 12.5, 0.01, null, 8, 2.25].forEach((value, i) =>
    seeds.push({ tenant: 'a', eventType: 'roi_value', value, minutesAgo: 29 + i * 120 })
  );
  // Outside the window (24 h and one minute old): must not be counted by either.
  seeds.push({ tenant: 'a', eventType: 'latency', value: 99999, minutesAgo: 24 * 60 + 1 });
  seeds.push({ tenant: 'a', eventType: 'roi_cost', value: 5555, minutesAgo: 24 * 60 + 2 });
  seeds.push({ tenant: 'a', eventType: 'drift', value: 1, flagged: true, minutesAgo: 24 * 60 + 3 });
  // Exactly at the start of the window: `recordedAt >= since` keeps it.
  seeds.push({
    tenant: 'a',
    eventType: 'latency',
    value: 777,
    flagged: false,
    minutesAgo: 24 * 60,
  });
}

function seedSmallTenants(seeds: Seed[]): void {
  // Tenant B: a little latency and ROI, no drift, no hallucination.
  [10, 20, 30, 30, 5000].forEach((value, i) =>
    seeds.push({
      tenant: 'b',
      eventType: 'latency',
      value,
      flagged: i === 4,
      minutesAgo: 8 + i * 9,
    })
  );
  seeds.push({ tenant: 'b', eventType: 'roi_cost', value: 40, minutesAgo: 70 });
  seeds.push({ tenant: 'b', eventType: 'roi_value', value: 10, minutesAgo: 71 });

  // Tenant C: events, but none inside the window: it has no snapshot at all.
  seeds.push({ tenant: 'c', eventType: 'latency', value: 1, minutesAgo: 30 * 60 });
  seeds.push({ tenant: 'c', eventType: 'drift', value: 1, flagged: true, minutesAgo: 31 * 60 });

  // Tenant D: hallucinations only: empty latency / ROI shapes, high hallucination rate.
  for (let i = 0; i < 4; i++) {
    seeds.push({
      tenant: 'd',
      eventType: 'hallucination',
      value: 0.9,
      flagged: i !== 3,
      model: 'gpt-4o',
      minutesAgo: 12 + i * 50,
      payload: { id: `d${i}` },
    });
  }

  // Global namespace (tenantId null): drift is published; the rest is ignored.
  seeds.push({
    tenant: 'global',
    eventType: 'drift',
    value: 0.7,
    flagged: true,
    severity: 'critical',
    metric: 'global-pca',
    minutesAgo: 60,
    payload: { pValue: 0.001 },
  });
  seeds.push({ tenant: 'global', eventType: 'drift', value: 0.2, flagged: false, minutesAgo: 600 });
  seeds.push({ tenant: 'global', eventType: 'latency', value: 4242, minutesAgo: 15 });
  seeds.push({
    tenant: 'global',
    eventType: 'hallucination',
    value: 1,
    flagged: true,
    minutesAgo: 16,
  });
  seeds.push({ tenant: 'global', eventType: 'roi_cost', value: 99, minutesAgo: 17 });
}

function seedTenantE(seeds: Seed[]): void {
  // Tenant E: 70 events of every kind, so a small cap cuts into the middle of the window.
  for (let i = 0; i < 70; i++) {
    const kinds = ['latency', 'latency', 'roi_cost', 'roi_value', 'drift', 'hallucination'];
    const eventType = kinds[i % kinds.length] ?? 'latency';
    seeds.push({
      tenant: 'e',
      eventType,
      value: ((i * 37) % 100) + (i % 4) / 4,
      flagged: flagFor(i),
      severity: eventSeverity(eventType, i),
      model: MODELS[i % MODELS.length] ?? null,
      minutesAgo: 1 + i * 19,
      payload: eventType === 'drift' || eventType === 'hallucination' ? { id: `e${i}` } : null,
    });
  }
}

function eventSeverity(eventType: string, i: number): string | null {
  if (eventType !== 'drift') return null;
  return i % 4 === 0 ? 'high' : 'low';
}

function buildSeeds(): Seed[] {
  const seeds: Seed[] = [];
  seedTenantA(seeds);
  seedSmallTenants(seeds);
  seedTenantE(seeds);
  return seeds;
}

/** Plain object of key -> parsed snapshot, from the `redis.set` calls of one tick. */
function fakeRedis() {
  const written = new Map<string, unknown>();
  return {
    written,
    redis: {
      set: async (key: string, value: string) => {
        written.set(key, JSON.parse(value));
        return 'OK';
      },
      get: async () => null,
    },
  };
}

/** Deep equality where numbers match to 9 decimal places and everything else matches exactly. */
function expectClose(got: unknown, want: unknown, path: string): void {
  if (typeof want === 'number' && typeof got === 'number') {
    const tol = 1e-9 * Math.max(1, Math.abs(want));
    if (Math.abs(got - want) > tol) throw new Error(`${path}: ${got} != ${want}`);
    return;
  }
  if (Array.isArray(want)) {
    expect(Array.isArray(got), path).toBe(true);
    expect((got as unknown[]).length, `${path}.length`).toBe(want.length);
    want.forEach((w, i) => expectClose((got as unknown[])[i], w, `${path}[${i}]`));
    return;
  }
  if (want && typeof want === 'object') {
    expect(got && typeof got === 'object', path).toBeTruthy();
    expect(Object.keys(got as object).sort(), `${path} keys`).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want)) {
      expectClose(
        (got as Record<string, unknown>)[k],
        (want as Record<string, unknown>)[k],
        `${path}.${k}`
      );
    }
    return;
  }
  expect(got, path).toEqual(want);
}

interface Call {
  op: 'findMany' | 'aggregate' | 'queryRaw';
  tenant: string | null | undefined;
  eventTypes: string[] | undefined;
  rows: number;
  bytes: number;
}

/** A client that records what every read returns: the rows and bytes the database sends to Node. */
function metered(tx: any) {
  const calls: Call[] = [];
  const record = (c: Call) => calls.push(c);
  const model = new Proxy(tx.aIMonitoringEvent, {
    get(t, k) {
      const f = t[k];
      if ((k !== 'findMany' && k !== 'aggregate') || typeof f !== 'function') return f;
      return async (args: any) => {
        const res = await f.call(t, args);
        const m = measureResult(res);
        record({
          op: k as 'findMany' | 'aggregate',
          tenant: args?.where?.tenantId,
          eventTypes: args?.where?.eventType?.in,
          ...m,
        });
        return res;
      };
    },
  });
  const proxy = new Proxy(tx, {
    get(t, k) {
      if (k === 'aIMonitoringEvent') return model;
      if (k === '$queryRaw') {
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const res = await t.$queryRaw(strings, ...values);
          record({
            op: 'queryRaw',
            tenant: values[1] as string | null,
            eventTypes: undefined,
            ...measureResult(res),
          });
          return res;
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return { db: proxy, calls };
}

describeDb('monitoring publisher: SQL aggregates equal the old Node computation', () => {
  let prisma: any;

  beforeAll(() => {
    // The generated client directly, like waiting-sql.test.ts: it seeds, so only a local test
    // database is accepted.
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: assertTestDatabaseUrl(DB_URL!) }),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function withSeededTenants(
    extra: Seed[],
    fn: (tx: any, ids: Record<Seed['tenant'], string | null>) => Promise<void>
  ): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      await prisma.$transaction(
        async (tx: any) => {
          const ids = { global: null } as Record<Seed['tenant'], string | null>;
          for (const t of ['a', 'b', 'c', 'd', 'e'] as const) {
            const row = await tx.tenant.create({
              data: { name: `pub-sql-${t}`, slug: `pub-sql-${t}-${crypto.randomUUID()}` },
            });
            ids[t] = row.id;
          }
          const rows = [...buildSeeds(), ...extra].map((s) => ({
            eventType: s.eventType,
            value: s.value ?? null,
            flagged: s.flagged ?? null,
            severity: s.severity ?? null,
            model: s.model ?? null,
            metric: s.metric ?? null,
            payload: s.payload ?? undefined,
            tenantId: ids[s.tenant],
            recordedAt: new Date(NOW - s.minutesAgo * MIN),
          }));
          await tx.aIMonitoringEvent.createMany({ data: rows });
          await fn(tx, ids);
          throw new Rollback();
        },
        { timeout: 60_000, maxWait: 30_000 }
      );
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    } finally {
      vi.useRealTimers();
    }
  }

  async function publishBoth(tx: any, cap?: number) {
    const opts = { lookbackMs: LOOKBACK_MS, ...(cap ? { eventsPerTenantCap: cap } : {}) };
    const old = fakeRedis();
    const neu = fakeRedis();
    await new LegacyRedisMonitoringPublisher(old.redis, tx, opts).tick();
    await new RedisMonitoringPublisher(neu.redis, tx, opts).tick();
    return { old: old.written, neu: neu.written };
  }

  function expectSame(old: Map<string, unknown>, neu: Map<string, unknown>) {
    expect([...neu.keys()].sort()).toEqual([...old.keys()].sort());
    for (const [key, want] of old) expectClose(neu.get(key), want, key);
  }

  it('every snapshot of every tenant is equal (several models, tenants and windows)', async () => {
    await withSeededTenants([], async (tx, ids) => {
      const { old, neu } = await publishBoth(tx);
      expectSame(old, neu);

      // Sanity: the fixture really exercises every branch.
      const key = (t: string, k: string) => `ai-mon:v1:${t}:${k}`;
      const lat = (neu.get(key(ids.a!, 'latency')) as any).stats;
      expect(lat.sampleCount).toBe(LATENCY_VALUES.length + 1); // + the one at the window start
      expect(lat.percentiles.p99).toBeGreaterThan(lat.percentiles.p95);
      expect(lat.percentiles.min).toBe(0); // the null value counts as 0
      expect(lat.percentiles.max).toBe(6100);
      expect((neu.get(key(ids.a!, 'roi')) as any).roi.totalCost).toBeCloseTo(4.265, 9);
      expect((neu.get(key(ids.a!, 'drift')) as any).status.trackedMetrics).toBe(6);
      expect((neu.get(key(ids.a!, 'status')) as any).drift.driftDetected).toBe(true);
      // Tenant D: no latency and no ROI, a hallucination rate over 5%.
      const dStatus = neu.get(key(ids.d!, 'status')) as any;
      expect(dStatus.healthy).toBe(false);
      expect((neu.get(key(ids.d!, 'latency')) as any).stats.sampleCount).toBe(0);
      expect((neu.get(key(ids.d!, 'roi')) as any).roi.totalCost).toBe(0);
      // Tenant C has nothing in the window, the global namespace publishes drift only.
      expect([...neu.keys()].some((k) => k.includes(`:${ids.c}:`))).toBe(false);
      expect(neu.has(key('global', 'drift'))).toBe(true);
      expect(neu.has(key('global', 'latency'))).toBe(false);
      expect((neu.get(key('global', 'drift')) as any).history).toHaveLength(2);
    });
  });

  it('equal when a tenant has more events than the cap (window cut by recordedAt)', async () => {
    await withSeededTenants([], async (tx, ids) => {
      const { old, neu } = await publishBoth(tx, 25);
      expectSame(old, neu);
      // Tenant E has 70 events, so the cap really cut its window; A has 70+ too.
      const eLatency = (neu.get(`ai-mon:v1:${ids.e}:latency`) as any).stats;
      const eFull = (await publishBoth(tx)).neu.get(`ai-mon:v1:${ids.e}:latency`) as any;
      expect(eLatency.sampleCount).toBeLessThan(eFull.stats.sampleCount);
    });
  });

  it('equal at a cap that no tenant reaches and at a cap of 1', async () => {
    await withSeededTenants([], async (tx) => {
      for (const cap of [10_000, 1]) {
        const { old, neu } = await publishBoth(tx, cap);
        expectSame(old, neu);
      }
    });
  });

  it('events that share the boundary timestamp are cut exactly at the cap, rows and aggregates alike', async () => {
    // Tenant C has nothing else in the window. Cap 5 newest: 3 latency events, then 4 drift
    // events with ONE timestamp. Two of the four fit; the same two (highest id) must feed the
    // aggregates and the listed rows, not all four.
    const tie = 600;
    const seeds: Seed[] = [
      ...[1, 2, 3].map((m) => ({
        tenant: 'c' as const,
        eventType: 'latency',
        value: m * 10,
        minutesAgo: m,
      })),
      ...[0, 1, 2, 3].map((i) => ({
        tenant: 'c' as const,
        eventType: 'drift',
        value: i,
        flagged: true,
        severity: 'high',
        minutesAgo: tie,
        payload: { pValue: i / 100 },
      })),
    ];
    await withSeededTenants(seeds, async (tx, ids) => {
      const out = fakeRedis();
      await new RedisMonitoringPublisher(out.redis, tx, {
        lookbackMs: LOOKBACK_MS,
        eventsPerTenantCap: 5,
      }).tick();
      const drift = out.written.get(`ai-mon:v1:${ids.c}:drift`) as any;
      const latency = out.written.get(`ai-mon:v1:${ids.c}:latency`) as any;
      const tied = await tx.aIMonitoringEvent.findMany({
        where: { tenantId: ids.c, eventType: 'drift', recordedAt: new Date(NOW - tie * MIN) },
        orderBy: { id: 'desc' },
        take: 2,
        select: { payload: true },
      });
      expect(drift.history).toHaveLength(2);
      expect(drift.status.trackedMetrics).toBe(2);
      expect(latency.stats.sampleCount).toBe(3);
      expect(drift.history.map((h: { pValue: number }) => h.pValue).sort()).toEqual(
        tied.map((r: { payload: { pValue: number } }) => r.payload.pValue).sort()
      );
    });
  });

  it('latency and ROI rows no longer leave the database: aggregate-sized results', async () => {
    // One tenant with the shape measured on prod: ~190 rows, mostly latency and ROI.
    const f: Seed[] = [];
    const add = (n: number, eventType: string, extra: Partial<Seed> = {}) => {
      for (let i = 0; i < n; i++) {
        f.push({
          tenant: 'd',
          eventType,
          value: 100 + ((i * 53) % 900),
          flagged: i % 9 === 0,
          model: MODELS[i % 3],
          metric: 'chat',
          minutesAgo: 200 + f.length * 6,
          ...extra,
        });
      }
    };
    add(150, 'latency');
    add(20, 'roi_cost');
    add(12, 'roi_value');
    add(5, 'drift', { severity: 'high', payload: { pValue: 0.04, recommendations: ['retrain'] } });
    await withSeededTenants(f, async (tx, ids) => {
      const tenant = ids.d!;
      const legacy = metered(tx);
      const neu = metered(tx);
      await new LegacyRedisMonitoringPublisher(fakeRedis().redis, legacy.db, {
        lookbackMs: LOOKBACK_MS,
      }).tick();
      await new RedisMonitoringPublisher(fakeRedis().redis, neu.db, {
        lookbackMs: LOOKBACK_MS,
      }).tick();

      const mine = (calls: Call[]) =>
        calls.filter((c) => c.tenant === tenant && c.op !== 'aggregate');
      const sum = (calls: Call[]) =>
        calls.reduce((s, c) => ({ rows: s.rows + c.rows, bytes: s.bytes + c.bytes }), {
          rows: 0,
          bytes: 0,
        });
      const before = sum(mine(legacy.calls));
      const after = sum(mine(neu.calls));
      console.log(
        `egress per publish of one tenant (${f.length} + 4 seeded events): ` +
          `before ${before.rows} rows / ${before.bytes} B, after ${after.rows} rows / ${after.bytes} B`
      );

      // The aggregate query returns one row, a few hundred bytes, however many events exist.
      const aggregateCalls = neu.calls.filter((c) => c.op === 'queryRaw');
      expect(aggregateCalls.length).toBeGreaterThan(0);
      for (const c of aggregateCalls) {
        expect(c.rows).toBe(1);
        expect(c.bytes).toBeLessThan(1000);
      }
      // No latency or ROI row is read any more: only drift and hallucination rows are.
      for (const c of neu.calls.filter((x) => x.op === 'findMany' && x.tenant !== undefined)) {
        expect(c.eventTypes?.every((t) => t === 'drift' || t === 'hallucination')).toBe(true);
      }
      expect(mine(legacy.calls).some((c) => c.eventTypes?.includes('latency'))).toBe(true);
      // Tenant D's reads: its 4 hallucinations + 5 drift rows, plus the one aggregate row.
      expect(after.rows).toBe(4 + 5 + 1);
      expect(before.rows).toBeGreaterThanOrEqual(f.length + 4);
      expect(after.bytes).toBeLessThan(before.bytes / 3);
    });
  });

  it('volume does not change the size of the aggregate result', async () => {
    const heavy: Seed[] = Array.from({ length: 900 }, (_, i) => ({
      tenant: 'b' as const,
      eventType: i % 3 === 0 ? 'roi_cost' : 'latency',
      value: i,
      flagged: i % 4 === 0,
      minutesAgo: 100 + i,
    }));
    await withSeededTenants(heavy, async (tx, ids) => {
      const m = metered(tx);
      await new RedisMonitoringPublisher(fakeRedis().redis, m.db, {
        lookbackMs: LOOKBACK_MS,
      }).tick();
      const forB = m.calls.filter((c) => c.op === 'queryRaw' && c.tenant === ids.b);
      expect(forB).toHaveLength(1);
      expect(forB[0]?.rows).toBe(1);
      expect(forB[0]?.bytes).toBeLessThan(1000);
    });
  });
});
