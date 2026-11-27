/**
 * AIMonitoringService — DB-backed query service for AI monitoring data (IFC-297)
 * Replaces in-memory singleton queries with PostgreSQL persistence.
 *
 * Egress discipline (docs/operations/supabase-egress-audit-1126.md): every figure that is
 * a count, sum, average or percentile is computed IN SQL and only the summary crosses the
 * wire. Raw event rows are returned only for the two lists that show rows (drift history,
 * hallucination results), and those are capped and select only the columns they show.
 * Results are cached in-process for a few minutes: the dashboard polls, the data moves slowly.
 *
 * The percentile rule is the one the JS code used: with the values sorted ascending, the
 * p-th percentile is the value at position ceil(n * p / 100) (1-based). It is written with
 * integer arithmetic ((n * p + 99) / 100) so it matches exactly, where percentile_disc's
 * floating-point fraction can differ by one position.
 */
import type { PrismaClient } from '@intelliflow/db';

interface DateRangeOpts {
  startTime?: Date;
  endTime?: Date;
}

interface TenantOpts {
  tenantId: string;
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

/** Newest-first cap on the rows one latency summary is computed from (unchanged from the JS version). */
export const LATENCY_SAMPLE_CAP = 10_000;

/** Default in-process cache lifetime. `AI_MONITORING_QUERY_CACHE_TTL_MS=0` turns the cache off. */
export const DEFAULT_QUERY_CACHE_TTL_MS = 120_000;
const MAX_CACHE_ENTRIES = 500;

export interface AIMonitoringServiceOptions {
  /** Cache lifetime in ms; 0 disables. Defaults to env AI_MONITORING_QUERY_CACHE_TTL_MS, then 2 min. */
  cacheTtlMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

function ttlFromEnv(): number {
  const raw = process.env.AI_MONITORING_QUERY_CACHE_TTL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_QUERY_CACHE_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUERY_CACHE_TTL_MS;
}

/** A finite number, or 0. Mirrors the boundary guard of the JS version (register #54). */
const toNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const msOrNull = (d: Date | undefined): number | null => (d ? d.getTime() : null);

interface PercentileRow {
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

export class AIMonitoringService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaClient,
    options: AIMonitoringServiceOptions = {}
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? ttlFromEnv();
    this.now = options.now ?? Date.now;
  }

  /** Drop every cached result (tests, and after a retention run). */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Run `load` once per key per TTL window. Concurrent callers share one in-flight query;
   * a failed query is never cached.
   */
  private cached<T>(method: string, tenantId: string, opts: unknown, load: () => Promise<T>) {
    if (this.cacheTtlMs <= 0) return load();
    const key = `${method}|${tenantId}|${JSON.stringify(opts ?? {})}`;
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;
    if (hit) this.cache.delete(key);
    const value = load();
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    const entry: CacheEntry = { expiresAt: now + this.cacheTtlMs, value };
    this.cache.set(key, entry);
    value.catch(() => {
      if (this.cache.get(key) === entry) this.cache.delete(key);
    });
    return value;
  }

  private dateFilter(opts: DateRangeOpts) {
    const where: Record<string, unknown> = {};
    if (opts.startTime || opts.endTime) {
      where.recordedAt = {
        ...(opts.startTime ? { gte: opts.startTime } : {}),
        ...(opts.endTime ? { lte: opts.endTime } : {}),
      };
    }
    return where;
  }

  /**
   * Tenant filter for non-drift event types.
   * Returns `{ tenantId }` so all events are scoped to the requesting tenant.
   */
  private tenantFilter(tenantId: string): Record<string, unknown> {
    return { tenantId };
  }

  /**
   * Drift events include both global signals (tenantId: null) and per-tenant
   * signals. Return both so the tenant sees global model drift alongside their own.
   */
  private driftTenantFilter(tenantId: string): Record<string, unknown> {
    return { OR: [{ tenantId: null }, { tenantId }] };
  }

  async getStatus({ tenantId }: TenantOpts) {
    // Bucket the 24 h window to the minute so the cache key is stable between polls.
    const sinceMs = Math.floor((this.now() - 24 * 60 * 60 * 1000) / 60_000) * 60_000;
    return this.cached('status', tenantId, {}, () => this.loadStatus(tenantId, sinceMs));
  }

  private async loadStatus(tenantId: string, sinceMs: number) {
    const db = this.prisma as any;

    // One round trip returns one row of counts and sums; one more returns two percentiles.
    const [countRows, pctRows] = await Promise.all([
      db.$queryRaw`
        SELECT
          (count(*) FILTER (WHERE "eventType" = 'drift'))::int AS drift_count,
          (count(*) FILTER (WHERE "eventType" = 'drift' AND flagged = true))::int AS drift_flagged,
          (count(*) FILTER (WHERE "eventType" = 'hallucination'))::int AS hallucination_count,
          (count(*) FILTER (WHERE "eventType" = 'hallucination' AND flagged = true))::int AS hallucination_flagged,
          (sum(value) FILTER (WHERE "eventType" = 'roi_cost'))::float8 AS cost_sum,
          (sum(value) FILTER (WHERE "eventType" = 'roi_value'))::float8 AS value_sum
        FROM ai_monitoring_events
        WHERE "recordedAt" >= (to_timestamp(${sinceMs}::double precision / 1000.0) AT TIME ZONE 'UTC')
          AND (
            ("eventType" = 'drift' AND ("tenantId" IS NULL OR "tenantId" = ${tenantId}))
            OR ("eventType" IN ('hallucination', 'roi_cost', 'roi_value') AND "tenantId" = ${tenantId})
          )`,
      db.$queryRaw`
        WITH lat AS (
          SELECT COALESCE(value, 0) AS v
          FROM ai_monitoring_events
          WHERE "eventType" = 'latency'
            AND "tenantId" = ${tenantId}
            AND "recordedAt" >= (to_timestamp(${sinceMs}::double precision / 1000.0) AT TIME ZONE 'UTC')
        ), ranked AS (
          SELECT v, row_number() OVER (ORDER BY v) AS rn, count(*) OVER () AS n FROM lat
        )
        SELECT
          (max(v) FILTER (WHERE rn = (n * 95 + 99) / 100))::float8 AS p95,
          (max(v) FILTER (WHERE rn = (n * 99 + 99) / 100))::float8 AS p99
        FROM ranked`,
    ]);

    const c = (countRows as any[])[0] ?? {};
    const driftCount = toNum(c.drift_count);
    const driftFlagged = toNum(c.drift_flagged);
    const hallucinationCount = toNum(c.hallucination_count);
    const hallucinationFlagged = toNum(c.hallucination_flagged);

    const hallucinationRate =
      hallucinationCount > 0 ? hallucinationFlagged / hallucinationCount : 0;
    const issues: string[] = [];
    if (driftFlagged > 0) issues.push(`${driftFlagged} drift detection(s) in last 24h`);
    if (hallucinationRate > 0.05)
      issues.push(
        `Hallucination rate ${(hallucinationRate * 100).toFixed(1)}% exceeds 5% threshold`
      );

    const p = ((pctRows as any[])[0] ?? {}) as Partial<PercentileRow>;
    const p95 = toNum(p.p95);
    const p99 = toNum(p.p99);

    const totalCost = toNum(c.cost_sum);
    const totalValue = toNum(c.value_sum);
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

  async getDriftMetrics(opts: DriftMetricsOpts & TenantOpts) {
    const { tenantId, ...rangeOpts } = opts;
    return this.cached('drift', tenantId, rangeOpts, () =>
      this.loadDriftMetrics(tenantId, rangeOpts)
    );
  }

  private async loadDriftMetrics(tenantId: string, rangeOpts: DriftMetricsOpts) {
    const db = this.prisma as any;
    const where = {
      eventType: 'drift',
      ...this.dateFilter(rangeOpts),
      ...this.driftTenantFilter(tenantId),
    };
    // Only the columns the history shows. `take` was always applied (default 100).
    const events = await db.aIMonitoringEvent.findMany({
      where,
      select: {
        flagged: true,
        severity: true,
        metric: true,
        model: true,
        value: true,
        payload: true,
        recordedAt: true,
      },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(rangeOpts.limit ?? 100, 100),
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

  async getLatencyMetrics(opts: LatencyMetricsOpts & TenantOpts) {
    const { tenantId, ...rangeOpts } = opts;
    return this.cached('latency', tenantId, rangeOpts, () =>
      this.loadLatencyMetrics(tenantId, rangeOpts)
    );
  }

  private async loadLatencyMetrics(tenantId: string, rangeOpts: LatencyMetricsOpts) {
    const db = this.prisma as any;
    const startMs = msOrNull(rangeOpts.startTime);
    const endMs = msOrNull(rangeOpts.endTime);

    // The summary of the newest LATENCY_SAMPLE_CAP events in range, computed in the database.
    const rows = await db.$queryRaw`
      WITH s AS (
        SELECT COALESCE(value, 0) AS v, COALESCE(flagged, false) AS f, "recordedAt" AS r
        FROM ai_monitoring_events
        WHERE "eventType" = 'latency'
          AND "tenantId" = ${tenantId}
          AND (${startMs}::double precision IS NULL
               OR "recordedAt" >= (to_timestamp(${startMs}::double precision / 1000.0) AT TIME ZONE 'UTC'))
          AND (${endMs}::double precision IS NULL
               OR "recordedAt" <= (to_timestamp(${endMs}::double precision / 1000.0) AT TIME ZONE 'UTC'))
        ORDER BY "recordedAt" DESC
        LIMIT ${LATENCY_SAMPLE_CAP}::bigint
      ), ranked AS (
        SELECT v, f, r, row_number() OVER (ORDER BY v) AS rn, count(*) OVER () AS n FROM s
      )
      SELECT
        (max(n))::int AS n,
        (avg(v))::float8 AS mean,
        (min(v))::float8 AS min,
        (max(v))::float8 AS max,
        (count(*) FILTER (WHERE NOT f))::int AS ok,
        min(r) AS oldest,
        max(r) AS newest,
        (max(v) FILTER (WHERE rn = (n * 50 + 99) / 100))::float8 AS p50,
        (max(v) FILTER (WHERE rn = (n * 75 + 99) / 100))::float8 AS p75,
        (max(v) FILTER (WHERE rn = (n * 90 + 99) / 100))::float8 AS p90,
        (max(v) FILTER (WHERE rn = (n * 95 + 99) / 100))::float8 AS p95,
        (max(v) FILTER (WHERE rn = (n * 99 + 99) / 100))::float8 AS p99
      FROM ranked`;
    const r = (rows as any[])[0] ?? {};
    const sampleCount = toNum(r.n);

    if (sampleCount === 0) {
      return {
        available: true,
        stats: {
          periodStart: rangeOpts.startTime ?? new Date(),
          periodEnd: rangeOpts.endTime ?? new Date(),
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

    const p95 = toNum(r.p95);
    const p99 = toNum(r.p99);
    const successRate = toNum(r.ok) / sampleCount;

    return {
      available: true,
      stats: {
        periodStart: r.oldest ?? new Date(),
        periodEnd: r.newest ?? new Date(),
        sampleCount,
        successRate,
        percentiles: {
          p50: toNum(r.p50),
          p75: toNum(r.p75),
          p90: toNum(r.p90),
          p95,
          p99,
          max: toNum(r.max),
          min: toNum(r.min),
          mean: toNum(r.mean),
          stdDev: 0,
        },
        byModel: {},
        byOperation: {},
        byPhase: {},
        sloCompliance: {
          p95Target: 2000,
          p99Target: 5000,
          p95Actual: p95,
          p99Actual: p99,
          p95Compliant: p95 <= 2000,
          p99Compliant: p99 <= 5000,
          overallCompliant: p95 <= 2000 && p99 <= 5000,
          complianceRate: successRate,
        },
      },
      alerts: [],
    };
  }

  async getLatencyTrend(opts: LatencyTrendOpts & TenantOpts) {
    const periodMinutes = opts.periodMinutes ?? 60;
    const bucketMinutes = opts.bucketMinutes ?? 5;
    const { tenantId, ...rangeOpts } = opts;
    // Bucket "now" to the minute so repeated polls share a cache key and a query.
    const sinceMs = Math.floor((this.now() - periodMinutes * 60 * 1000) / 60_000) * 60_000;
    return this.cached(
      'trend',
      tenantId,
      { rangeOpts, periodMinutes, bucketMinutes, sinceMs },
      () => this.loadLatencyTrend(tenantId, rangeOpts, bucketMinutes, sinceMs)
    );
  }

  private async loadLatencyTrend(
    tenantId: string,
    rangeOpts: LatencyTrendOpts,
    bucketMinutes: number,
    sinceMs: number
  ) {
    const db = this.prisma as any;
    // Window rule of the JS version: the later of `since` and startTime is the lower bound,
    // and endTime only applies when startTime is the binding bound.
    let lowerMs = sinceMs;
    let upperMs: number | null = null;
    const startMs = msOrNull(rangeOpts.startTime);
    if (startMs !== null && !(sinceMs > startMs)) {
      lowerMs = startMs;
      upperMs = msOrNull(rangeOpts.endTime);
    }

    const bucketMs = bucketMinutes * 60 * 1000;
    const rows = await db.$queryRaw`
      WITH s AS (
        SELECT
          COALESCE(value, 0) AS v,
          floor(extract(epoch FROM "recordedAt") * 1000 / ${bucketMs}::numeric) * ${bucketMs}::numeric AS b
        FROM ai_monitoring_events
        WHERE "eventType" = 'latency'
          AND "tenantId" = ${tenantId}
          AND "recordedAt" >= (to_timestamp(${lowerMs}::double precision / 1000.0) AT TIME ZONE 'UTC')
          AND (${upperMs}::double precision IS NULL
               OR "recordedAt" <= (to_timestamp(${upperMs}::double precision / 1000.0) AT TIME ZONE 'UTC'))
      ), ranked AS (
        SELECT b, v,
               row_number() OVER (PARTITION BY b ORDER BY v) AS rn,
               count(*) OVER (PARTITION BY b) AS n
        FROM s
      )
      SELECT
        (b)::float8 AS b,
        (max(n))::int AS count,
        (max(v) FILTER (WHERE rn = (n * 50 + 99) / 100))::float8 AS p50,
        (max(v) FILTER (WHERE rn = (n * 95 + 99) / 100))::float8 AS p95,
        (max(v) FILTER (WHERE rn = (n * 99 + 99) / 100))::float8 AS p99
      FROM ranked
      GROUP BY b
      ORDER BY b ASC`;

    const trend = (rows as any[]).map((row) => ({
      timestamp: new Date(Number(row.b)),
      p50: toNum(row.p50),
      p95: toNum(row.p95),
      p99: toNum(row.p99),
      count: toNum(row.count),
    }));

    return { available: true, trend };
  }

  async getHallucinationReport(opts: HallucinationReportOpts & TenantOpts) {
    const { tenantId, ...rangeOpts } = opts;
    return this.cached('hallucination', tenantId, rangeOpts, () =>
      this.loadHallucinationReport(tenantId, rangeOpts)
    );
  }

  private async loadHallucinationReport(tenantId: string, rangeOpts: HallucinationReportOpts) {
    const db = this.prisma as any;
    const where = {
      eventType: 'hallucination',
      ...this.dateFilter(rangeOpts),
      ...this.tenantFilter(tenantId),
    };
    const events = await db.aIMonitoringEvent.findMany({
      where,
      select: {
        id: true,
        recordedAt: true,
        model: true,
        flagged: true,
        value: true,
        payload: true,
      },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(rangeOpts.limit ?? 100, 100),
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

  async getROIMetrics(opts: ROIMetricsOpts & TenantOpts) {
    const { tenantId, ...rangeOpts } = opts;
    return this.cached('roi', tenantId, rangeOpts, () => this.loadROIMetrics(tenantId, rangeOpts));
  }

  private async loadROIMetrics(tenantId: string, rangeOpts: ROIMetricsOpts) {
    const db = this.prisma as any;
    const startMs = msOrNull(rangeOpts.startTime);
    const endMs = msOrNull(rangeOpts.endTime);

    // Boundary guard (register #54): a value that is NaN or infinite counts as 0, per row.
    const rows = (await db.$queryRaw`
      SELECT
        "eventType" AS event_type,
        (count(*))::int AS n,
        (COALESCE(sum(
          CASE WHEN value IS NOT NULL
                AND value NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
               THEN value ELSE 0 END
        ), 0))::float8 AS total
      FROM ai_monitoring_events
      WHERE "eventType" IN ('roi_cost', 'roi_value')
        AND "tenantId" = ${tenantId}
        AND (${startMs}::double precision IS NULL
             OR "recordedAt" >= (to_timestamp(${startMs}::double precision / 1000.0) AT TIME ZONE 'UTC'))
        AND (${endMs}::double precision IS NULL
             OR "recordedAt" <= (to_timestamp(${endMs}::double precision / 1000.0) AT TIME ZONE 'UTC'))
      GROUP BY "eventType"`) as Array<{ event_type: string; n: number; total: number }>;

    const cost = rows.find((r) => r.event_type === 'roi_cost');
    const value = rows.find((r) => r.event_type === 'roi_value');
    const costCount = toNum(cost?.n);
    const valueCount = toNum(value?.n);
    const totalCost = toNum(cost?.total);
    const totalValue = toNum(value?.total);
    const netValue = totalValue - totalCost;
    const roi = totalCost > 0 ? (netValue / totalCost) * 100 : 0;

    return {
      available: true,
      roi: {
        periodStart: rangeOpts.startTime ?? new Date(this.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: rangeOpts.endTime ?? new Date(),
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
        totalCostsTracked: costCount,
        totalValuesTracked: valueCount,
        currentROI: roi,
        averageCostPerOperation: costCount > 0 ? totalCost / costCount : 0,
        averageValuePerOperation: valueCount > 0 ? totalValue / valueCount : 0,
        roiTrend: 'stable' as const,
        topPerformingOperations: [],
        underperformingOperations: [],
      },
    };
  }
}
