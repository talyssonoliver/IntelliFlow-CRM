/**
 * AI monitoring summaries computed in SQL equal the old JavaScript calculation (egress audit 1126).
 *
 * `AIMonitoringService` used to read raw `ai_monitoring_events` rows and aggregate them in
 * Node (every dashboard poll shipped up to 10,000 rows). It now asks Postgres for the summary.
 * This suite seeds one tenant's events into a real database, inside a transaction that always
 * rolls back, then runs BOTH implementations on the same rows:
 *
 *   - `legacy*` below is the previous code, copied verbatim in logic (findMany + JS maths).
 *   - the service under test is the new SQL one.
 *
 * Counts, percentiles, min/max, success rates and bucket timestamps must be identical; sums and
 * means are compared to 9 decimal places (SQL and JS add floating-point numbers in a different
 * order).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createIsolatedTestPrismaClient } from './setup';
import { AIMonitoringService } from '../../apps/api/src/services/AIMonitoringService';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

class Rollback extends Error {}

const MIN = 60_000;

interface Seed {
  eventType: string;
  value: number | null;
  flagged: boolean | null;
  minutesAgo: number;
  tenant?: 'mine' | 'other' | 'global';
  severity?: string | null;
}

// Values repeat on purpose (ties), include nulls (counted as 0) and flagged = null/false/true.
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

/** Three-state flag: true, null (unknown) and false all occur. */
function flagFor(i: number): boolean | null {
  if (i % 7 === 0) return true;
  if (i % 5 === 0) return null;
  return false;
}

function tenantIdFor(tenant: Seed['tenant'], ids: { mine: string; other: string }): string | null {
  if (tenant === 'other') return ids.other;
  if (tenant === 'global') return null;
  return ids.mine;
}

function buildSeeds(): Seed[] {
  const seeds: Seed[] = [];
  LATENCY_VALUES.forEach((value, i) => {
    seeds.push({
      eventType: 'latency',
      value,
      flagged: flagFor(i),
      minutesAgo: 5 + i * 2 + (i % 3) * 0.25,
    });
  });
  // other tenant and global rows must never leak into "mine"
  seeds.push({
    eventType: 'latency',
    value: 99999,
    flagged: true,
    minutesAgo: 10,
    tenant: 'other',
  });
  seeds.push({
    eventType: 'latency',
    value: 88888,
    flagged: true,
    minutesAgo: 11,
    tenant: 'global',
  });

  for (let i = 0; i < 12; i++) {
    seeds.push({
      eventType: 'hallucination',
      value: i / 10,
      flagged: i % 4 === 0,
      minutesAgo: 20 + i * 30,
    });
  }
  // drift: global and tenant signals both count for the tenant
  seeds.push({
    eventType: 'drift',
    value: 0.4,
    flagged: true,
    severity: 'high',
    minutesAgo: 60,
    tenant: 'global',
  });
  seeds.push({ eventType: 'drift', value: 0.1, flagged: false, severity: 'low', minutesAgo: 70 });
  seeds.push({
    eventType: 'drift',
    value: 0.9,
    flagged: true,
    severity: 'critical',
    minutesAgo: 200,
  });
  seeds.push({
    eventType: 'drift',
    value: 0.5,
    flagged: true,
    severity: 'high',
    minutesAgo: 60,
    tenant: 'other',
  });

  const costs = [0.012, 0.5, 1.25, null, 0.003, 2.5];
  costs.forEach((value, i) =>
    seeds.push({ eventType: 'roi_cost', value, flagged: null, minutesAgo: 15 + i * 40 })
  );
  const values = [3.1, 0.7, 12.5, 0.01, null, 8, 2.25];
  values.forEach((value, i) =>
    seeds.push({ eventType: 'roi_value', value, flagged: null, minutesAgo: 25 + i * 35 })
  );
  seeds.push({ eventType: 'roi_cost', value: 777, flagged: null, minutesAgo: 30, tenant: 'other' });
  return seeds;
}

// ------------------------------------------------------------------------------------------
// The previous implementation, as it was before the SQL rewrite (reference for the proof).
// ------------------------------------------------------------------------------------------
const pct = (arr: number[], p: number) =>
  arr.length > 0 ? (arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0) : 0;
const pctRaw = (arr: number[], p: number) => arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0;
const toNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

async function legacyStatus(db: any, tenantId: string, now: number) {
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const dtf = { OR: [{ tenantId: null }, { tenantId }] };
  const tf = { tenantId };
  const count = (where: object) => db.aIMonitoringEvent.count({ where });
  const driftCount = await count({ eventType: 'drift', recordedAt: { gte: since }, ...dtf });
  const hallucinationCount = await count({
    eventType: 'hallucination',
    recordedAt: { gte: since },
    ...tf,
  });
  const hallucinationFlagged = await count({
    eventType: 'hallucination',
    flagged: true,
    recordedAt: { gte: since },
    ...tf,
  });
  const driftFlagged = await count({
    eventType: 'drift',
    flagged: true,
    recordedAt: { gte: since },
    ...dtf,
  });
  const latencyEvents = await db.aIMonitoringEvent.findMany({
    where: { eventType: 'latency', recordedAt: { gte: since }, ...tf },
    select: { value: true },
    orderBy: { value: 'asc' },
  });
  const latencyValues = latencyEvents
    .map((e: any) => e.value ?? 0)
    .sort((a: number, b: number) => a - b);
  const cost = await db.aIMonitoringEvent.aggregate({
    where: { eventType: 'roi_cost', recordedAt: { gte: since }, ...tf },
    _sum: { value: true },
  });
  const value = await db.aIMonitoringEvent.aggregate({
    where: { eventType: 'roi_value', recordedAt: { gte: since }, ...tf },
    _sum: { value: true },
  });
  const totalCost = toNum(cost._sum?.value);
  const totalValue = toNum(value._sum?.value);
  const rate = hallucinationCount > 0 ? hallucinationFlagged / hallucinationCount : 0;
  return {
    driftCount,
    driftFlagged,
    hallucinationCount,
    rate,
    p95: pct(latencyValues, 95),
    p99: pct(latencyValues, 99),
    totalCost,
    totalValue,
    currentROI: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
  };
}

async function legacyLatency(
  db: any,
  tenantId: string,
  range: { startTime?: Date; endTime?: Date }
) {
  const recordedAt =
    range.startTime || range.endTime
      ? {
          ...(range.startTime ? { gte: range.startTime } : {}),
          ...(range.endTime ? { lte: range.endTime } : {}),
        }
      : undefined;
  const events = await db.aIMonitoringEvent.findMany({
    where: { eventType: 'latency', ...(recordedAt ? { recordedAt } : {}), tenantId },
    orderBy: { recordedAt: 'desc' },
    take: 10000,
  });
  if (events.length === 0) return null;
  const durations = events.map((e: any) => e.value ?? 0).sort((a: number, b: number) => a - b);
  const successCount = events.filter((e: any) => !e.flagged).length;
  return {
    periodStart: events[events.length - 1].recordedAt as Date,
    periodEnd: events[0].recordedAt as Date,
    sampleCount: events.length,
    successRate: successCount / events.length,
    p50: pctRaw(durations, 50),
    p75: pctRaw(durations, 75),
    p90: pctRaw(durations, 90),
    p95: pctRaw(durations, 95),
    p99: pctRaw(durations, 99),
    max: durations[durations.length - 1],
    min: durations[0],
    mean: durations.reduce((a: number, b: number) => a + b, 0) / durations.length,
  };
}

async function legacyTrend(
  db: any,
  tenantId: string,
  now: number,
  periodMinutes: number,
  bucketMinutes: number
) {
  const since = new Date(now - periodMinutes * 60 * 1000);
  const events = await db.aIMonitoringEvent.findMany({
    where: { eventType: 'latency', recordedAt: { gte: since }, tenantId },
    orderBy: { recordedAt: 'asc' },
  });
  const bucketMs = bucketMinutes * 60 * 1000;
  const buckets = new Map<number, number[]>();
  for (const e of events) {
    const key = Math.floor(new Date(e.recordedAt).getTime() / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e.value ?? 0);
  }
  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.ceil((sorted.length * p) / 100) - 1] ?? 0;
  };
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, values]) => ({
      timestamp: new Date(ts),
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      count: values.length,
    }));
}

async function legacyRoi(db: any, tenantId: string, range: { startTime?: Date; endTime?: Date }) {
  const recordedAt =
    range.startTime || range.endTime
      ? {
          ...(range.startTime ? { gte: range.startTime } : {}),
          ...(range.endTime ? { lte: range.endTime } : {}),
        }
      : undefined;
  const w = (eventType: string) => ({ eventType, ...(recordedAt ? { recordedAt } : {}), tenantId });
  const [costEvents, valueEvents] = await Promise.all([
    db.aIMonitoringEvent.findMany({ where: w('roi_cost') }),
    db.aIMonitoringEvent.findMany({ where: w('roi_value') }),
  ]);
  const totalCost = costEvents.reduce((s: number, e: any) => s + toNum(e.value), 0);
  const totalValue = valueEvents.reduce((s: number, e: any) => s + toNum(e.value), 0);
  const netValue = totalValue - totalCost;
  return {
    totalCost,
    totalValue,
    netValue,
    roi: totalCost > 0 ? (netValue / totalCost) * 100 : 0,
    efficiency: totalCost > 0 ? totalValue / totalCost : 0,
    costCount: costEvents.length,
    valueCount: valueEvents.length,
    avgCost: costEvents.length > 0 ? totalCost / costEvents.length : 0,
    avgValue: valueEvents.length > 0 ? totalValue / valueEvents.length : 0,
  };
}

// ------------------------------------------------------------------------------------------

describeDb('AI monitoring summaries: SQL equals the old JavaScript calculation', () => {
  let prisma: any;

  beforeAll(() => {
    prisma = createIsolatedTestPrismaClient();
  });

  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function withSeededTenant(
    fn: (tx: any, ids: { mine: string; other: string }, now: number) => Promise<void>
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx: any) => {
        const mk = (label: string) =>
          tx.tenant.create({
            data: {
              name: `egress-parity-${label}`,
              slug: `egress-parity-${label}-${randomUUID()}`,
            },
          });
        const [mine, other] = [await mk('mine'), await mk('other')];
        const now = Date.now();
        const rows = buildSeeds().map((s) => ({
          eventType: s.eventType,
          value: s.value,
          flagged: s.flagged,
          severity: s.severity ?? null,
          tenantId: tenantIdFor(s.tenant, { mine: mine.id, other: other.id }),
          recordedAt: new Date(now - s.minutesAgo * MIN),
          payload: { seeded: true },
        }));
        await tx.aIMonitoringEvent.createMany({ data: rows });
        await fn(tx, { mine: mine.id, other: other.id }, now);
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
  }

  it('getStatus: counts, percentiles and ROI match', async () => {
    await withSeededTenant(async (tx, ids, now) => {
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getStatus({ tenantId: ids.mine });
      const want = await legacyStatus(tx, ids.mine, now);

      expect(got.drift.trackedMetrics).toBe(want.driftCount);
      expect(got.drift.highSeverityCount).toBe(want.driftFlagged);
      expect(got.hallucination.totalChecks).toBe(want.hallucinationCount);
      expect(got.hallucination.rate).toBeCloseTo(want.rate, 12);
      expect(got.latency.p95).toBe(want.p95);
      expect(got.latency.p99).toBe(want.p99);
      expect(got.roi.totalCost).toBeCloseTo(want.totalCost, 9);
      expect(got.roi.totalValue).toBeCloseTo(want.totalValue, 9);
      expect(got.roi.currentROI).toBeCloseTo(want.currentROI, 6);
      // sanity: the fixture really exercises every branch
      expect(want.driftCount).toBe(3);
      expect(want.p99).toBeGreaterThan(want.p95);
      expect(want.totalCost).toBeGreaterThan(0);
    });
  });

  it('getStatus for a tenant with no events is all zeros, like before', async () => {
    await withSeededTenant(async (tx, _ids, now) => {
      const empty = randomUUID();
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getStatus({ tenantId: empty });
      const want = await legacyStatus(tx, empty, now);
      expect(got.drift.trackedMetrics).toBe(want.driftCount); // only the global drift signal
      expect(got.latency.p95).toBe(0);
      expect(got.hallucination.rate).toBe(0);
      expect(got.roi.totalCost).toBe(0);
    });
  });

  it.each([
    ['no range', {}],
    ['start only', { startMinutesAgo: 40 }],
    ['start and end', { startMinutesAgo: 60, endMinutesAgo: 20 }],
    ['end only', { endMinutesAgo: 30 }],
  ])('getLatencyMetrics matches (%s)', async (_label, r: any) => {
    await withSeededTenant(async (tx, ids, now) => {
      const range = {
        ...(r.startMinutesAgo ? { startTime: new Date(now - r.startMinutesAgo * MIN) } : {}),
        ...(r.endMinutesAgo ? { endTime: new Date(now - r.endMinutesAgo * MIN) } : {}),
      };
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getLatencyMetrics({ tenantId: ids.mine, ...range });
      const want = await legacyLatency(tx, ids.mine, range);
      if (!want) throw new Error('the seed holds latency events in every range tested here');
      const s = got.stats;
      expect(s.sampleCount).toBe(want.sampleCount);
      expect(s.successRate).toBeCloseTo(want.successRate, 12);
      expect(s.percentiles.p50).toBe(want.p50);
      expect(s.percentiles.p75).toBe(want.p75);
      expect(s.percentiles.p90).toBe(want.p90);
      expect(s.percentiles.p95).toBe(want.p95);
      expect(s.percentiles.p99).toBe(want.p99);
      expect(s.percentiles.max).toBe(want.max);
      expect(s.percentiles.min).toBe(want.min);
      expect(s.percentiles.mean).toBeCloseTo(want.mean, 9);
      expect(new Date(s.periodStart).getTime()).toBe(want.periodStart.getTime());
      expect(new Date(s.periodEnd).getTime()).toBe(want.periodEnd.getTime());
      expect(s.sloCompliance.p95Compliant).toBe(want.p95 <= 2000);
      expect(s.sloCompliance.p99Compliant).toBe(want.p99 <= 5000);
    });
  });

  it('getLatencyMetrics for a range with no rows returns the empty shape, like before', async () => {
    await withSeededTenant(async (tx, ids, now) => {
      const range = {
        startTime: new Date(now - 5000 * MIN),
        endTime: new Date(now - 4000 * MIN),
      };
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getLatencyMetrics({ tenantId: ids.mine, ...range });
      expect(await legacyLatency(tx, ids.mine, range)).toBeNull();
      expect(got.stats.sampleCount).toBe(0);
      expect(got.stats.successRate).toBe(1);
      expect(got.stats.percentiles.p99).toBe(0);
    });
  });

  it.each([
    [120, 5],
    [120, 1],
    [30, 5],
    [90, 15],
  ])('getLatencyTrend matches (period %i min, bucket %i min)', async (period, bucket) => {
    await withSeededTenant(async (tx, ids, now) => {
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getLatencyTrend({
        tenantId: ids.mine,
        periodMinutes: period,
        bucketMinutes: bucket,
      });
      // The service floors its window start to the minute; line the legacy `since` up the same
      // way so the comparison is about the maths and not the one-minute edge.
      const sinceAligned = Math.floor((now - period * MIN) / MIN) * MIN;
      const want = await legacyTrend(tx, ids.mine, sinceAligned + period * MIN, period, bucket);
      expect(got.trend.length).toBe(want.length);
      expect(got.trend.length).toBeGreaterThan(0);
      got.trend.forEach((row, i) => {
        expect(row.timestamp.getTime()).toBe(want[i].timestamp.getTime());
        expect(row.count).toBe(want[i].count);
        expect(row.p50).toBe(want[i].p50);
        expect(row.p95).toBe(want[i].p95);
        expect(row.p99).toBe(want[i].p99);
      });
    });
  });

  it.each([
    ['no range', {}],
    ['start only', { startMinutesAgo: 120 }],
    ['start and end', { startMinutesAgo: 200, endMinutesAgo: 60 }],
  ])('getROIMetrics matches (%s)', async (_label, r: any) => {
    await withSeededTenant(async (tx, ids, now) => {
      const range = {
        ...(r.startMinutesAgo ? { startTime: new Date(now - r.startMinutesAgo * MIN) } : {}),
        ...(r.endMinutesAgo ? { endTime: new Date(now - r.endMinutesAgo * MIN) } : {}),
      };
      const service = new AIMonitoringService(tx, { cacheTtlMs: 0, now: () => now });
      const got = await service.getROIMetrics({ tenantId: ids.mine, ...range });
      const want = await legacyRoi(tx, ids.mine, range);
      expect(got.roi.totalCost).toBeCloseTo(want.totalCost, 9);
      expect(got.roi.totalValue).toBeCloseTo(want.totalValue, 9);
      expect(got.roi.netValue).toBeCloseTo(want.netValue, 9);
      expect(got.roi.roi).toBeCloseTo(want.roi, 6);
      expect(got.roi.efficiency).toBeCloseTo(want.efficiency, 9);
      expect(got.stats.totalCostsTracked).toBe(want.costCount);
      expect(got.stats.totalValuesTracked).toBe(want.valueCount);
      expect(got.stats.averageCostPerOperation).toBeCloseTo(want.avgCost, 9);
      expect(got.stats.averageValuePerOperation).toBeCloseTo(want.avgValue, 9);
    });
  });

  it('the summary queries return a handful of numbers, never event rows', async () => {
    await withSeededTenant(async (tx, ids, now) => {
      const seen: unknown[] = [];
      const spy = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === '$queryRaw') {
            return async (...args: unknown[]) => {
              const rows = await (target as any).$queryRaw(...args);
              seen.push(rows);
              return rows;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      const service = new AIMonitoringService(spy as any, { cacheTtlMs: 0, now: () => now });
      await service.getStatus({ tenantId: ids.mine });
      await service.getLatencyMetrics({ tenantId: ids.mine });
      await service.getROIMetrics({ tenantId: ids.mine });
      const rowCounts = (seen as unknown[][]).map((r) => r.length);
      // status: 1 + 1 rows, latency: 1 row, roi: 2 rows (cost, value). The seed holds 40+ latency events.
      expect(rowCounts).toEqual([1, 1, 1, 2]);
    });
  });
});
