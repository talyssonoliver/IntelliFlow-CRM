/**
 * AIMonitoringService — DB-backed query service for AI monitoring data (IFC-297)
 * Replaces in-memory singleton queries with PostgreSQL persistence.
 */
import type { PrismaClient } from '@intelliflow/db';

interface DateRangeOpts {
  startTime?: Date;
  endTime?: Date;
  tenantId?: string;
}

interface DriftMetricsOpts extends DateRangeOpts {
  limit?: number;
}

type LatencyMetricsOpts = DateRangeOpts;

interface LatencyTrendOpts extends DateRangeOpts {
  periodMinutes?: number;
  bucketMinutes?: number;
}

interface HallucinationReportOpts extends DateRangeOpts {
  limit?: number;
}

type ROIMetricsOpts = DateRangeOpts;

export class AIMonitoringService {
  constructor(private readonly prisma: PrismaClient) {}

  private dateFilter(opts: DateRangeOpts) {
    const where: Record<string, unknown> = {};
    if (opts.startTime || opts.endTime) {
      where.recordedAt = {
        ...(opts.startTime ? { gte: opts.startTime } : {}),
        ...(opts.endTime ? { lte: opts.endTime } : {}),
      };
    }
    if (opts.tenantId) {
      where.tenantId = opts.tenantId;
    }
    return where;
  }

  async getStatus() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = this.prisma as any;

    const [driftCount, latencyCount, hallucinationCount, roiCostCount] = await Promise.all([
      db.aIMonitoringEvent.count({ where: { eventType: 'drift', recordedAt: { gte: since } } }),
      db.aIMonitoringEvent.count({ where: { eventType: 'latency', recordedAt: { gte: since } } }),
      db.aIMonitoringEvent.count({
        where: { eventType: 'hallucination', recordedAt: { gte: since } },
      }),
      db.aIMonitoringEvent.count({ where: { eventType: 'roi_cost', recordedAt: { gte: since } } }),
    ]);

    const hallucinationFlagged = await db.aIMonitoringEvent.count({
      where: { eventType: 'hallucination', flagged: true, recordedAt: { gte: since } },
    });

    const driftFlagged = await db.aIMonitoringEvent.count({
      where: { eventType: 'drift', flagged: true, recordedAt: { gte: since } },
    });

    const hallucinationRate =
      hallucinationCount > 0 ? hallucinationFlagged / hallucinationCount : 0;
    const issues: string[] = [];
    if (driftFlagged > 0) issues.push(`${driftFlagged} drift detection(s) in last 24h`);
    if (hallucinationRate > 0.05)
      issues.push(
        `Hallucination rate ${(hallucinationRate * 100).toFixed(1)}% exceeds 5% threshold`
      );

    // Compute latency p95/p99 from recent events
    const latencyEvents = await db.aIMonitoringEvent.findMany({
      where: { eventType: 'latency', recordedAt: { gte: since } },
      select: { value: true },
      orderBy: { value: 'asc' },
    });
    const latencyValues = latencyEvents
      .map((e: any) => e.value ?? 0)
      .sort((a: number, b: number) => a - b);
    const pct = (arr: number[], p: number) =>
      arr.length > 0 ? (arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0) : 0;
    const p95 = pct(latencyValues, 95);
    const p99 = pct(latencyValues, 99);

    // Compute ROI totals
    const roiCostSum = await db.aIMonitoringEvent.aggregate({
      where: { eventType: 'roi_cost', recordedAt: { gte: since } },
      _sum: { value: true },
    });
    const roiValueSum = await db.aIMonitoringEvent.aggregate({
      where: { eventType: 'roi_value', recordedAt: { gte: since } },
      _sum: { value: true },
    });
    const totalCost = roiCostSum._sum?.value ?? 0;
    const totalValue = roiValueSum._sum?.value ?? 0;
    const currentROI = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    return {
      available: true,
      healthy: issues.length === 0,
      issues,
      drift: {
        trackedMetrics: driftCount,
        driftDetected: driftFlagged > 0,
        highSeverityCount: driftFlagged,
      },
      latency: {
        sloCompliant: p95 <= 2000,
        p95,
        p99,
      },
      hallucination: {
        rate: hallucinationRate,
        kpiCompliant: hallucinationRate <= 0.05,
        totalChecks: hallucinationCount,
      },
      roi: { currentROI, totalCost, totalValue },
    };
  }

  async getDriftMetrics(opts: DriftMetricsOpts = {}) {
    const db = this.prisma as any;
    const where = { eventType: 'drift', ...this.dateFilter(opts) };
    const events = await db.aIMonitoringEvent.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: opts.limit ?? 100,
    });

    const driftFlagged = events.filter((e: any) => e.flagged);
    const highSeverity = events.filter(
      (e: any) => e.severity === 'high' || e.severity === 'critical'
    );

    return {
      available: true,
      status: {
        trackedMetrics: events.length,
        totalSamples: events.length,
        driftDetected: driftFlagged.length > 0,
        highSeverityCount: highSeverity.length,
        lastCheck: events[0]?.recordedAt ?? null,
      },
      history: events.map((e: any) => ({
        detected: e.flagged ?? false,
        severity: e.severity ?? 'none',
        metric: e.metric ?? e.model ?? 'unknown',
        driftScore: e.value ?? 0,
        pValue: e.payload?.pValue ?? 1,
        timestamp: e.recordedAt,
        baselineWindow: e.payload?.baselineWindow ?? null,
        currentWindow: e.payload?.currentWindow ?? null,
        recommendations: e.payload?.recommendations ?? [],
      })),
    };
  }

  async getLatencyMetrics(opts: LatencyMetricsOpts = {}) {
    const db = this.prisma as any;
    const where = { eventType: 'latency', ...this.dateFilter(opts) };
    const events = await db.aIMonitoringEvent.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: 10000,
    });

    if (events.length === 0) {
      return {
        available: true,
        stats: {
          periodStart: opts.startTime ?? new Date(),
          periodEnd: opts.endTime ?? new Date(),
          sampleCount: 0,
          successRate: 1,
          percentiles: {
            p50: 0,
            p75: 0,
            p90: 0,
            p95: 0,
            p99: 0,
            max: 0,
            min: 0,
            mean: 0,
            stdDev: 0,
          },
          byModel: {},
          byOperation: {},
          byPhase: {},
          sloCompliance: {
            p95Target: 2000,
            p99Target: 5000,
            p95Actual: 0,
            p99Actual: 0,
            p95Compliant: true,
            p99Compliant: true,
            overallCompliant: true,
            complianceRate: 1,
          },
        },
        alerts: [],
      };
    }

    const durations = events.map((e: any) => e.value ?? 0).sort((a: number, b: number) => a - b);
    const successCount = events.filter((e: any) => !e.flagged).length;
    const percentile = (arr: number[], p: number) =>
      arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0;

    return {
      available: true,
      stats: {
        periodStart: events[events.length - 1]?.recordedAt ?? new Date(),
        periodEnd: events[0]?.recordedAt ?? new Date(),
        sampleCount: events.length,
        successRate: successCount / events.length,
        percentiles: {
          p50: percentile(durations, 50),
          p75: percentile(durations, 75),
          p90: percentile(durations, 90),
          p95: percentile(durations, 95),
          p99: percentile(durations, 99),
          max: durations[durations.length - 1] ?? 0,
          min: durations[0] ?? 0,
          mean: durations.reduce((a: number, b: number) => a + b, 0) / durations.length,
          stdDev: 0,
        },
        byModel: {},
        byOperation: {},
        byPhase: {},
        sloCompliance: {
          p95Target: 2000,
          p99Target: 5000,
          p95Actual: percentile(durations, 95),
          p99Actual: percentile(durations, 99),
          p95Compliant: percentile(durations, 95) <= 2000,
          p99Compliant: percentile(durations, 99) <= 5000,
          overallCompliant: percentile(durations, 95) <= 2000 && percentile(durations, 99) <= 5000,
          complianceRate: successCount / events.length,
        },
      },
      alerts: [],
    };
  }

  async getLatencyTrend(opts: LatencyTrendOpts = {}) {
    const periodMinutes = opts.periodMinutes ?? 60;
    const bucketMinutes = opts.bucketMinutes ?? 5;
    const db = this.prisma as any;
    const since = new Date(Date.now() - periodMinutes * 60 * 1000);
    const where = { eventType: 'latency', recordedAt: { gte: since }, ...this.dateFilter(opts) };
    // Ensure recordedAt gte uses the more recent of since and opts.startTime
    if (!opts.startTime || since > opts.startTime) {
      (where as any).recordedAt = { gte: since };
    }

    const events = await db.aIMonitoringEvent.findMany({ where, orderBy: { recordedAt: 'asc' } });

    const bucketMs = bucketMinutes * 60 * 1000;
    const buckets = new Map<number, number[]>();

    for (const e of events) {
      const ts = new Date(e.recordedAt).getTime();
      const bucketKey = Math.floor(ts / bucketMs) * bucketMs;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey)!.push(e.value ?? 0);
    }

    const percentile = (arr: number[], p: number) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.ceil((sorted.length * p) / 100) - 1] ?? 0;
    };

    const trend = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, values]) => ({
        timestamp: new Date(ts),
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
        count: values.length,
      }));

    return { available: true, trend };
  }

  async getHallucinationReport(opts: HallucinationReportOpts = {}) {
    const db = this.prisma as any;
    const where = { eventType: 'hallucination', ...this.dateFilter(opts) };
    const events = await db.aIMonitoringEvent.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: opts.limit ?? 100,
    });

    const total = events.length;
    const flagged = events.filter((e: any) => e.flagged).length;

    return {
      available: true,
      stats: {
        totalChecks: total,
        hallucinationsDetected: flagged,
        hallucinationRate: total > 0 ? flagged / total : 0,
        byType: {},
        byModel: {},
        averageConfidence: 0,
        periodStart: events[events.length - 1]?.recordedAt ?? new Date(),
        periodEnd: events[0]?.recordedAt ?? new Date(),
        kpiCompliant: total === 0 || flagged / total <= 0.05,
      },
      recentResults: events.map((e: any) => ({
        id: e.id,
        timestamp: e.recordedAt,
        model: e.model ?? 'unknown',
        hallucinated: e.flagged ?? false,
        confidence: e.payload?.confidence ?? 0,
        hallucinationTypes: e.payload?.hallucinationTypes ?? [],
        evidence: e.payload?.evidence ?? [],
        groundTruthSources: e.payload?.groundTruthSources ?? [],
        score: e.value ?? 0,
      })),
    };
  }

  async getROIMetrics(opts: ROIMetricsOpts = {}) {
    const db = this.prisma as any;
    const costWhere = { eventType: 'roi_cost', ...this.dateFilter(opts) };
    const valueWhere = { eventType: 'roi_value', ...this.dateFilter(opts) };

    const [costEvents, valueEvents] = await Promise.all([
      db.aIMonitoringEvent.findMany({ where: costWhere }),
      db.aIMonitoringEvent.findMany({ where: valueWhere }),
    ]);

    const totalCost = costEvents.reduce((sum: number, e: any) => sum + (e.value ?? 0), 0);
    const totalValue = valueEvents.reduce((sum: number, e: any) => sum + (e.value ?? 0), 0);
    const netValue = totalValue - totalCost;
    const roi = totalCost > 0 ? (netValue / totalCost) * 100 : 0;

    return {
      available: true,
      roi: {
        periodStart: opts.startTime ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: opts.endTime ?? new Date(),
        totalCost,
        totalValue,
        netValue,
        roi,
        costBreakdown: {},
        valueBreakdown: {},
        efficiency: totalCost > 0 ? totalValue / totalCost : 0,
        trendDirection: 'stable' as const,
        recommendations: [],
      },
      stats: {
        totalCostsTracked: costEvents.length,
        totalValuesTracked: valueEvents.length,
        currentROI: roi,
        averageCostPerOperation: costEvents.length > 0 ? totalCost / costEvents.length : 0,
        averageValuePerOperation: valueEvents.length > 0 ? totalValue / valueEvents.length : 0,
        roiTrend: 'stable' as const,
        topPerformingOperations: [],
        underperformingOperations: [],
      },
    };
  }
}
