/**
 * @vitest-environment node
 *
 * AIMonitoringService unit tests (SQL-summary version, egress audit 1126).
 *
 * The aggregates run in Postgres, so these tests mock `$queryRaw` and prove the mapping from the
 * SQL row to the response, the empty paths, the bound parameters, the caps and the cache. That
 * the SQL itself gives the same figures as the old JavaScript calculation is proven against a
 * real database in tests/integration/ai-monitoring-sql-parity.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMonitoringService } from '../AIMonitoringService';

type Rows = unknown[];

/** Tagged-template mock: picks the canned rows by a marker found in the SQL text. */
function makePrisma(canned: Partial<Record<'counts' | 'pct' | 'latency' | 'trend' | 'roi', Rows>>) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    calls.push({ sql, values });
    if (sql.includes('drift_count')) return canned.counts ?? [{}];
    if (
      sql.includes('AS p99') &&
      sql.includes('FROM ranked') &&
      !sql.includes('oldest') &&
      !sql.includes('GROUP BY b')
    )
      return canned.pct ?? [{ p95: null, p99: null }];
    if (sql.includes('oldest')) return canned.latency ?? [{ n: null }];
    if (sql.includes('GROUP BY b')) return canned.trend ?? [];
    if (sql.includes('event_type')) return canned.roi ?? [];
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  });
  return {
    prisma: {
      $queryRaw,
      aIMonitoringEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as any,
    calls,
  };
}

const TENANT = 'tenant-test-001';
const NOW = Date.UTC(2026, 10, 26, 12, 0, 30); // 30 s past the minute

function svc(prisma: any, opts: { cacheTtlMs?: number; now?: () => number } = {}) {
  return new AIMonitoringService(prisma, { cacheTtlMs: 0, now: () => NOW, ...opts });
}

describe('AIMonitoringService', () => {
  describe('getStatus', () => {
    it('returns healthy status with zeros when there are no events', async () => {
      const { prisma } = makePrisma({});
      const result = await svc(prisma).getStatus({ tenantId: TENANT });
      expect(result.available).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.latency).toEqual({ sloCompliant: true, p95: 0, p99: 0 });
      expect(result.roi).toEqual({ currentROI: 0, totalCost: 0, totalValue: 0 });
    });

    it('maps the one counts row and the percentile row', async () => {
      const { prisma } = makePrisma({
        counts: [
          {
            drift_count: 10,
            drift_flagged: 2,
            hallucination_count: 20,
            hallucination_flagged: 0,
            cost_sum: 2,
            value_sum: 5,
          },
        ],
        pct: [{ p95: 1800, p99: 2500 }],
      });
      const result = await svc(prisma).getStatus({ tenantId: TENANT });
      expect(result.drift).toEqual({
        trackedMetrics: 10,
        driftDetected: true,
        highSeverityCount: 2,
      });
      expect(result.issues).toEqual(['2 drift detection(s) in last 24h']);
      expect(result.healthy).toBe(false);
      expect(result.latency).toEqual({ sloCompliant: true, p95: 1800, p99: 2500 });
      expect(result.hallucination).toEqual({ rate: 0, kpiCompliant: true, totalChecks: 20 });
      expect(result.roi).toEqual({ currentROI: 150, totalCost: 2, totalValue: 5 });
    });

    it('reports an issue when the hallucination rate exceeds 5%', async () => {
      const { prisma } = makePrisma({
        counts: [{ hallucination_count: 100, hallucination_flagged: 10 }],
      });
      const result = await svc(prisma).getStatus({ tenantId: TENANT });
      expect(result.hallucination.rate).toBeCloseTo(0.1);
      expect(result.hallucination.kpiCompliant).toBe(false);
      expect(result.issues.some((i) => i.includes('Hallucination rate 10.0%'))).toBe(true);
    });

    it('marks the latency SLO as missed above 2000 ms p95', async () => {
      const { prisma } = makePrisma({ pct: [{ p95: 2100, p99: 3000 }] });
      const result = await svc(prisma).getStatus({ tenantId: TENANT });
      expect(result.latency.sloCompliant).toBe(false);
    });

    it('treats a NaN or infinite sum as 0 (boundary guard)', async () => {
      const { prisma } = makePrisma({ counts: [{ cost_sum: Number.NaN, value_sum: Infinity }] });
      const result = await svc(prisma).getStatus({ tenantId: TENANT });
      expect(result.roi).toEqual({ currentROI: 0, totalCost: 0, totalValue: 0 });
    });

    it('binds the tenant and a 24 h window floored to the minute; two queries, no row reads', async () => {
      const { prisma, calls } = makePrisma({});
      await svc(prisma).getStatus({ tenantId: TENANT });
      expect(calls).toHaveLength(2);
      const expectedSince = Math.floor((NOW - 24 * 3600_000) / 60_000) * 60_000;
      for (const c of calls) {
        expect(c.values).toContain(TENANT);
        expect(c.values).toContain(expectedSince);
      }
      expect(prisma.aIMonitoringEvent.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getLatencyMetrics', () => {
    it('maps the summary row into percentiles and SLO compliance', async () => {
      const oldest = new Date('2026-11-26T10:00:00Z');
      const newest = new Date('2026-11-26T11:59:00Z');
      const { prisma } = makePrisma({
        latency: [
          {
            n: 4,
            mean: 262.5,
            min: 100,
            max: 500,
            ok: 3,
            oldest,
            newest,
            p50: 150,
            p75: 300,
            p90: 500,
            p95: 500,
            p99: 500,
          },
        ],
      });
      const { stats } = await svc(prisma).getLatencyMetrics({ tenantId: TENANT });
      expect(stats.sampleCount).toBe(4);
      expect(stats.successRate).toBe(0.75);
      expect(stats.percentiles).toMatchObject({
        p50: 150,
        p75: 300,
        p90: 500,
        p95: 500,
        p99: 500,
        max: 500,
        min: 100,
        mean: 262.5,
      });
      expect(stats.periodStart).toBe(oldest);
      expect(stats.periodEnd).toBe(newest);
      expect(stats.sloCompliance.overallCompliant).toBe(true);
      expect(stats.sloCompliance.complianceRate).toBe(0.75);
    });

    it('returns empty stats when no events are in range', async () => {
      const { prisma } = makePrisma({});
      const { stats, alerts } = await svc(prisma).getLatencyMetrics({ tenantId: TENANT });
      expect(stats.sampleCount).toBe(0);
      expect(stats.successRate).toBe(1);
      expect(stats.percentiles.p99).toBe(0);
      expect(alerts).toEqual([]);
    });

    it('binds the range and the 10,000 sample cap', async () => {
      const { prisma, calls } = makePrisma({});
      const startTime = new Date('2026-11-26T08:00:00Z');
      const endTime = new Date('2026-11-26T09:00:00Z');
      await svc(prisma).getLatencyMetrics({ tenantId: TENANT, startTime, endTime });
      expect(calls[0].values).toEqual(
        expect.arrayContaining([TENANT, startTime.getTime(), endTime.getTime(), 10_000])
      );
      expect(calls[0].sql).toMatch(/LIMIT \?::bigint/);
    });
  });

  describe('getLatencyTrend', () => {
    it('maps bucket rows to trend points', async () => {
      const b = Date.UTC(2026, 10, 26, 11, 0, 0);
      const { prisma } = makePrisma({
        trend: [
          { b, count: 3, p50: 100, p95: 200, p99: 300 },
          { b: b + 300_000, count: 1, p50: 50, p95: 50, p99: 50 },
        ],
      });
      const { trend } = await svc(prisma).getLatencyTrend({ tenantId: TENANT });
      expect(trend).toEqual([
        { timestamp: new Date(b), p50: 100, p95: 200, p99: 300, count: 3 },
        { timestamp: new Date(b + 300_000), p50: 50, p95: 50, p99: 50, count: 1 },
      ]);
    });

    it('returns an empty trend for no events', async () => {
      const { prisma } = makePrisma({});
      expect((await svc(prisma).getLatencyTrend({ tenantId: TENANT })).trend).toEqual([]);
    });

    it('uses the later of the period start and startTime, and ignores endTime otherwise (as before)', async () => {
      const { prisma, calls } = makePrisma({});
      const since = Math.floor((NOW - 60 * 60_000) / 60_000) * 60_000;
      const oldStart = new Date(since - 3_600_000);
      await svc(prisma).getLatencyTrend({
        tenantId: TENANT,
        startTime: oldStart,
        endTime: new Date(NOW),
      });
      expect(calls[0].values).toContain(since);
      expect(calls[0].values).not.toContain(NOW);

      const recentStart = new Date(since + 600_000);
      const end = new Date(since + 1_200_000);
      await svc(prisma).getLatencyTrend({ tenantId: TENANT, startTime: recentStart, endTime: end });
      expect(calls[1].values).toEqual(
        expect.arrayContaining([recentStart.getTime(), end.getTime()])
      );
    });
  });

  describe('getROIMetrics', () => {
    it('computes ROI from the grouped sums', async () => {
      const { prisma } = makePrisma({
        roi: [
          { event_type: 'roi_cost', n: 2, total: 0.5 },
          { event_type: 'roi_value', n: 1, total: 2.5 },
        ],
      });
      const r = await svc(prisma).getROIMetrics({ tenantId: TENANT });
      expect(r.roi.totalCost).toBe(0.5);
      expect(r.roi.totalValue).toBe(2.5);
      expect(r.roi.netValue).toBe(2);
      expect(r.roi.roi).toBe(400);
      expect(r.roi.efficiency).toBe(5);
      expect(r.stats.totalCostsTracked).toBe(2);
      expect(r.stats.totalValuesTracked).toBe(1);
      expect(r.stats.averageCostPerOperation).toBe(0.25);
      expect(r.stats.averageValuePerOperation).toBe(2.5);
      expect(r.roi.periodStart).toEqual(new Date(NOW - 7 * 24 * 3600_000));
    });

    it('returns zero ROI when no events exist', async () => {
      const { prisma } = makePrisma({});
      const r = await svc(prisma).getROIMetrics({ tenantId: TENANT });
      expect(r.roi.totalCost).toBe(0);
      expect(r.roi.roi).toBe(0);
      expect(r.stats.averageCostPerOperation).toBe(0);
    });

    it('guards a NaN total', async () => {
      const { prisma } = makePrisma({ roi: [{ event_type: 'roi_cost', n: 1, total: Number.NaN }] });
      const r = await svc(prisma).getROIMetrics({ tenantId: TENANT });
      expect(r.roi.totalCost).toBe(0);
    });
  });

  describe('row lists (drift history, hallucination results)', () => {
    it('drift: selects only shown columns, caps the page at 100, merges tenant and global', async () => {
      const { prisma } = makePrisma({});
      const recordedAt = new Date('2026-11-26T10:00:00Z');
      prisma.aIMonitoringEvent.findMany.mockResolvedValue([
        {
          flagged: true,
          severity: 'high',
          metric: 'm1',
          model: 'x',
          value: 0.7,
          payload: { pValue: 0.01, recommendations: ['r'] },
          recordedAt,
        },
        {
          flagged: false,
          severity: null,
          metric: null,
          model: null,
          value: null,
          payload: null,
          recordedAt,
        },
      ]);
      const result = await svc(prisma).getDriftMetrics({ tenantId: TENANT, limit: 5000 });
      const args = prisma.aIMonitoringEvent.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([{ tenantId: null }, { tenantId: TENANT }]);
      expect(args.take).toBe(100);
      expect(Object.keys(args.select).sort()).toEqual(
        ['flagged', 'metric', 'model', 'payload', 'recordedAt', 'severity', 'value'].sort()
      );
      expect(result.status).toMatchObject({
        trackedMetrics: 2,
        driftDetected: true,
        highSeverityCount: 1,
        lastCheck: recordedAt,
      });
      expect(result.history[0]).toMatchObject({
        detected: true,
        severity: 'high',
        metric: 'm1',
        driftScore: 0.7,
        pValue: 0.01,
        recommendations: ['r'],
      });
      expect(result.history[1]).toMatchObject({
        detected: false,
        severity: 'none',
        metric: 'unknown',
        driftScore: 0,
        pValue: 1,
      });
    });

    it('hallucination: scoped to the tenant, capped, stats over the returned page', async () => {
      const { prisma } = makePrisma({});
      const t = new Date('2026-11-26T10:00:00Z');
      prisma.aIMonitoringEvent.findMany.mockResolvedValue([
        {
          id: 'a',
          recordedAt: t,
          model: 'gpt',
          flagged: true,
          value: 0.9,
          payload: { confidence: 0.8, evidence: ['e'] },
        },
        { id: 'b', recordedAt: t, model: null, flagged: false, value: null, payload: null },
      ]);
      const result = await svc(prisma).getHallucinationReport({ tenantId: TENANT });
      const args = prisma.aIMonitoringEvent.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ eventType: 'hallucination', tenantId: TENANT });
      expect(args.take).toBe(100);
      expect(result.stats.hallucinationRate).toBe(0.5);
      expect(result.stats.kpiCompliant).toBe(false);
      expect(result.recentResults[0]).toMatchObject({
        id: 'a',
        model: 'gpt',
        hallucinated: true,
        confidence: 0.8,
      });
      expect(result.recentResults[1]).toMatchObject({
        model: 'unknown',
        hallucinated: false,
        score: 0,
      });
    });

    it('hallucination: empty page is compliant', async () => {
      const { prisma } = makePrisma({});
      const r = await svc(prisma).getHallucinationReport({ tenantId: TENANT, limit: 10 });
      expect(r.stats.totalChecks).toBe(0);
      expect(r.stats.kpiCompliant).toBe(true);
    });
  });

  describe('cache', () => {
    it('serves a repeat call from memory inside the TTL and re-queries after it', async () => {
      let now = NOW;
      const { prisma } = makePrisma({});
      const s = new AIMonitoringService(prisma, { cacheTtlMs: 120_000, now: () => now });
      await s.getROIMetrics({ tenantId: TENANT });
      await s.getROIMetrics({ tenantId: TENANT });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      now += 119_000;
      await s.getROIMetrics({ tenantId: TENANT });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      now += 2_000;
      await s.getROIMetrics({ tenantId: TENANT });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('never shares a result between tenants or between different parameters', async () => {
      const { prisma } = makePrisma({});
      const s = new AIMonitoringService(prisma, { cacheTtlMs: 120_000, now: () => NOW });
      await s.getROIMetrics({ tenantId: 'a' });
      await s.getROIMetrics({ tenantId: 'b' });
      await s.getROIMetrics({ tenantId: 'a', startTime: new Date(1000) });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('shares one in-flight query between concurrent callers', async () => {
      const { prisma } = makePrisma({});
      const s = new AIMonitoringService(prisma, { cacheTtlMs: 120_000, now: () => NOW });
      await Promise.all([s.getStatus({ tenantId: TENANT }), s.getStatus({ tenantId: TENANT })]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // one status = 2 queries, not 4
    });

    it('does not cache a failure', async () => {
      const { prisma } = makePrisma({});
      prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
      const s = new AIMonitoringService(prisma, { cacheTtlMs: 120_000, now: () => NOW });
      await expect(s.getROIMetrics({ tenantId: TENANT })).rejects.toThrow('db down');
      await expect(s.getROIMetrics({ tenantId: TENANT })).resolves.toBeDefined();
    });

    it('is off when the TTL is 0, and clearCache() empties it', async () => {
      const { prisma } = makePrisma({});
      const off = new AIMonitoringService(prisma, { cacheTtlMs: 0, now: () => NOW });
      await off.getROIMetrics({ tenantId: TENANT });
      await off.getROIMetrics({ tenantId: TENANT });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

      const on = new AIMonitoringService(prisma, { cacheTtlMs: 120_000, now: () => NOW });
      await on.getROIMetrics({ tenantId: TENANT });
      on.clearCache();
      await on.getROIMetrics({ tenantId: TENANT });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('reads the TTL from AI_MONITORING_QUERY_CACHE_TTL_MS', async () => {
      const { prisma } = makePrisma({});
      vi.stubEnv('AI_MONITORING_QUERY_CACHE_TTL_MS', '0');
      try {
        const s = new AIMonitoringService(prisma, { now: () => NOW });
        await s.getROIMetrics({ tenantId: TENANT });
        await s.getROIMetrics({ tenantId: TENANT });
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
});
