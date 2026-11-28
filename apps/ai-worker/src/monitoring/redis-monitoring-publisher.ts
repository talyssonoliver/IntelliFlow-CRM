/**
 * RedisMonitoringPublisher (IFC-214)
 *
 * Publishes tenant-scoped AI monitoring snapshots to Redis every 60 s so the
 * API can serve dashboard reads from a low-latency cache instead of
 * scanning the full `AIMonitoringEvent` table on every request.
 *
 * Layered ON TOP OF the IFC-297 DB tier (`AIMonitoringService` +
 * `MonitoringFlushService`). Reads from the Postgres `AIMonitoringEvent`
 * table — NOT the in-memory singletons — so multi-pod deployments stay
 * consistent. See ADR-052 §"Why publisher reads from DB, not singletons".
 *
 * R-016 (Cache Poisoning) controls applied at WRITE time:
 *   1. Tenant-scoped key namespacing (no cross-tenant leakage).
 *   2. Schema version prefix `v1` in every key (no cross-version reads).
 *   3. TTL ≥ 6× publish cadence (stale-empty windows fall through to DB).
 *
 * Cadence: the source table is only written by `MonitoringFlushService` every
 * 60 s, so publishing faster re-sends identical snapshots. At the old 5 s
 * default each tick cost 1 + N(tenants) queries, ~17k per 6 h for no new data.
 *
 * @module monitoring/redis-monitoring-publisher
 * @task IFC-214
 * @see docs/architecture/adr/ADR-052-redis-monitoring-snapshot-bridge.md
 * @see .specify/sprints/sprint-18/specifications/IFC-214-spec.md
 */

import pino from 'pino';
import type { PrismaClient } from '@intelliflow/db';
import { fetchWindowAggregates, type WindowAggregates } from './monitoring-aggregates-sql';

const logger = pino({
  name: 'redis-monitoring-publisher',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Minimal Redis interface — accepts ioredis without coupling to the package.
 * Only the methods we actually call are required. Tests can pass a hand-rolled
 * stub that implements just these.
 */
export interface RedisLike {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  quit?(): Promise<unknown>;
}

export interface RedisMonitoringPublisherOptions {
  intervalMs?: number;
  ttlSeconds?: number;
  disabled?: boolean;
  /**
   * Optional override for the lookback window when computing snapshots.
   * Defaults to 24 h. Tests use small windows to control fixture data.
   */
  lookbackMs?: number;
  /** Newest events per tenant that a snapshot is built from. Defaults to 10,000; tests shrink it. */
  eventsPerTenantCap?: number;
}

export type SnapshotKind = 'status' | 'drift' | 'latency' | 'hallucination' | 'roi';

const SNAPSHOT_KINDS: readonly SnapshotKind[] = [
  'status',
  'drift',
  'latency',
  'hallucination',
  'roi',
];

/**
 * Every tick that reads rows is Supabase pooler egress. 5 min is plenty for a
 * dashboard cache; set AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS to change it.
 */
export const DEFAULT_PUBLISH_INTERVAL_MS = 300_000;
/** R-016 control 3: TTL ≥ 6× the publish cadence. */
const TTL_TO_INTERVAL_RATIO = 6;

/**
 * Only drift and hallucination snapshots list rows (history, recentResults), so only those rows
 * are read, with their payload. Everything else a snapshot shows (latency percentiles, success
 * rate, ROI sums and counts) is computed by Postgres (monitoring-aggregates-sql.ts), so the
 * latency and ROI rows never leave the database.
 */
const PAYLOAD_EVENT_TYPES = ['drift', 'hallucination'];
const EVENTS_PER_TENANT_CAP = 10000;

const SCHEMA_VERSION = 'v1';
const KEY_PREFIX = 'ai-mon';
const GLOBAL_NAMESPACE = 'global';

/**
 * Build a Redis key for a snapshot. Format: `ai-mon:v1:{tenantId|global}:{kind}`.
 * Tenant ID is the sole namespace input — no other request fields participate.
 */
export function redisKey(tenantId: string, kind: SnapshotKind): string {
  return `${KEY_PREFIX}:${SCHEMA_VERSION}:${tenantId}:${kind}`;
}

interface AIMonitoringEventRow {
  tenantId: string | null;
  eventType: string;
  recordedAt: Date;
  value: number | null;
  flagged: boolean | null;
  severity: string | null;
  metric: string | null;
  model: string | null;
  payload: unknown;
}

/**
 * Periodically aggregates Postgres `AIMonitoringEvent` rows into per-tenant
 * snapshots and writes them to Redis under tenant-namespaced versioned keys.
 *
 * Lifecycle:
 *   const pub = new RedisMonitoringPublisher(redisClient, prisma);
 *   pub.start();              // setInterval
 *   await pub.stop();         // clearInterval + final tick + redis.quit()
 *
 * Test seam: `tick()` is public so unit tests can drive a single cycle.
 */
export class RedisMonitoringPublisher {
  private readonly intervalMs: number;
  private readonly ttlSeconds: number;
  private readonly disabled: boolean;
  private readonly lookbackMs: number;
  private readonly cap: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Cheap change marker (count|max recordedAt) of the last full publish. */
  private lastMarker: string | null = null;
  /** Epoch ms of the last write of the snapshots to Redis. */
  private lastPublishAt = 0;
  /** Serialized snapshots of the last full publish, re-sent to extend the TTL. */
  private lastPayloads = new Map<string, string>();

  constructor(
    private readonly redis: RedisLike | null,
    private readonly prisma: PrismaClient,
    opts: RedisMonitoringPublisherOptions = {}
  ) {
    this.intervalMs =
      opts.intervalMs ??
      (Number(process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS) || DEFAULT_PUBLISH_INTERVAL_MS);
    // The TTL follows the cadence unless set explicitly: a fixed 30 s TTL under a
    // 60 s cadence would leave every key expired for half of each cycle.
    this.ttlSeconds =
      opts.ttlSeconds ??
      (Number(process.env.AI_MONITORING_REDIS_TTL_SECONDS) ||
        Math.ceil((this.intervalMs * TTL_TO_INTERVAL_RATIO) / 1000));
    if (this.ttlSeconds * 1000 <= this.intervalMs) {
      logger.warn(
        { intervalMs: this.intervalMs, ttlSeconds: this.ttlSeconds },
        'TTL is not longer than the publish interval — snapshots will expire between ticks and reads will fall through to the DB'
      );
    }
    this.disabled =
      opts.disabled ?? (process.env.AI_MONITORING_REDIS_DISABLED === '1' || redis === null);
    this.lookbackMs = opts.lookbackMs ?? 24 * 60 * 60 * 1000;
    this.cap = opts.eventsPerTenantCap ?? EVENTS_PER_TENANT_CAP;
  }

  start(): void {
    if (this.disabled) {
      logger.info('RedisMonitoringPublisher disabled (env or null client) — start() is a no-op');
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'periodic tick failed');
      });
    }, this.intervalMs);
    logger.info({ intervalMs: this.intervalMs, ttlSeconds: this.ttlSeconds }, 'started');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.disabled) {
      try {
        await this.tick();
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'final tick failed');
      }
    }
    if (this.redis?.quit) {
      try {
        await this.redis.quit();
      } catch {
        // best-effort cleanup
      }
    }
    logger.info('stopped');
  }

  /**
   * Run one publish cycle. Public for testability.
   *
   * Strategy (audit-finding-#4 fix): query distinct tenants in the lookback
   * window first, then fetch each tenant's events (and global tenantId=null
   * events) separately with `take: 10000` PER tenant. The previous global
   * `findMany({ where: { recordedAt: ... }, take: 10000 })` would silently
   * drop low-volume tenants in deployments where total event rate exceeds
   * 10k/window — exactly when monitoring matters most.
   *
   * @returns counts of writes that succeeded vs. were skipped due to errors.
   */
  async tick(): Promise<{ written: number; skipped: number }> {
    if (this.disabled || !this.redis) {
      return { written: 0, skipped: 0 };
    }

    const since = new Date(Date.now() - this.lookbackMs);

    // Cheap marker first (one aggregate, a few bytes back). If nothing was added
    // or aged out of the window since the last publish, read no rows at all:
    // do nothing while the Redis snapshots have more than half their TTL left,
    // and past that re-send the cached payloads to extend it (Redis only).
    const marker = await this.fetchMarker(since);
    if (marker !== null && marker === this.lastMarker) {
      const age = Date.now() - this.lastPublishAt;
      if (age < (this.ttlSeconds * 1000) / 2) return { written: 0, skipped: 0 };
      return this.writeAll(this.lastPayloads);
    }

    const tenantIds = await this.fetchActiveTenants(since); // includes `null` if global drift events present

    const payloads = new Map<string, string>();
    for (const tenantId of tenantIds) {
      const namespace = tenantId ?? GLOBAL_NAMESPACE;
      const agg = await fetchWindowAggregates(this.prisma, since, tenantId, this.cap);
      const ns_events = await this.fetchEventsForTenant(since, tenantId, agg.cutoff);
      // Global namespace ONLY publishes the drift snapshot — the other 4 kinds
      // are tenant-scoped by definition (see AIMonitoringService.tenantFilter).
      const kindsForNs: readonly SnapshotKind[] =
        namespace === GLOBAL_NAMESPACE ? (['drift'] as const) : SNAPSHOT_KINDS;
      for (const kind of kindsForNs) {
        payloads.set(
          redisKey(namespace, kind),
          JSON.stringify(this.buildSnapshot(kind, ns_events, agg))
        );
      }
    }

    const result = await this.writeAll(payloads);
    // Only remember the marker after a clean publish, so a failed write retries
    // with a full read on the next tick.
    if (result.skipped === 0 && marker !== null) {
      this.lastMarker = marker;
      this.lastPayloads = payloads;
    } else {
      this.lastMarker = null;
    }
    return result;
  }

  private async writeAll(
    payloads: Map<string, string>
  ): Promise<{ written: number; skipped: number }> {
    const redis = this.redis;
    let written = 0;
    let skipped = 0;
    if (!redis) return { written, skipped };
    for (const [key, json] of payloads) {
      try {
        await redis.set(key, json, 'EX', this.ttlSeconds);
        written += 1;
      } catch (err) {
        skipped += 1;
        logger.warn(
          { key, err: err instanceof Error ? err.message : err },
          'redis.set failed — snapshot skipped'
        );
      }
    }
    if (skipped === 0) this.lastPublishAt = Date.now();
    else this.lastMarker = null;
    return { written, skipped };
  }

  /**
   * Row count and newest recordedAt inside the lookback window. Both change when
   * an event arrives (max, count) or ages out (count). Returns null if the probe
   * fails, which forces a normal full publish.
   */
  private async fetchMarker(since: Date): Promise<string | null> {
    const db = this.prisma as unknown as {
      aIMonitoringEvent: {
        aggregate: (args: unknown) => Promise<{
          _count: { _all: number };
          _max: { recordedAt: Date | null };
        }>;
      };
    };
    try {
      const r = await db.aIMonitoringEvent.aggregate({
        where: { recordedAt: { gte: since } },
        _count: { _all: true },
        _max: { recordedAt: true },
      });
      return `${r._count._all}|${r._max.recordedAt ? new Date(r._max.recordedAt).getTime() : 0}`;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'marker probe failed');
      return null;
    }
  }

  /**
   * Find every distinct tenantId (including `null` for global events) that
   * has at least one event in the lookback window. Returns an array of
   * tenant IDs (with `null` representing the global namespace).
   */
  private async fetchActiveTenants(since: Date): Promise<(string | null)[]> {
    const db = this.prisma as unknown as {
      aIMonitoringEvent: {
        findMany: (args: unknown) => Promise<{ tenantId: string | null }[]>;
      };
    };
    const rows = await db.aIMonitoringEvent.findMany({
      where: { recordedAt: { gte: since } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  /**
   * Fetch the drift and hallucination events of a single tenant (or global, when tenantId ===
   * null), with their payload, newest first. These are the only rows a snapshot lists.
   * `cutoff` is the start of the tenant's capped window (see fetchWindowAggregates), so the rows
   * and the aggregates describe the same newest-`cap` events. The global namespace only
   * publishes the drift snapshot, so it reads no hallucination rows.
   */
  private async fetchEventsForTenant(
    since: Date,
    tenantId: string | null,
    cutoff: Date | null
  ): Promise<AIMonitoringEventRow[]> {
    const db = this.prisma as unknown as {
      aIMonitoringEvent: {
        findMany: (args: unknown) => Promise<AIMonitoringEventRow[]>;
      };
    };
    const from = cutoff && cutoff > since ? cutoff : since;
    return db.aIMonitoringEvent.findMany({
      where: {
        recordedAt: { gte: from },
        tenantId,
        eventType: { in: tenantId === null ? ['drift'] : PAYLOAD_EVENT_TYPES },
      },
      select: {
        tenantId: true,
        eventType: true,
        recordedAt: true,
        value: true,
        flagged: true,
        severity: true,
        metric: true,
        model: true,
        payload: true,
      },
      orderBy: { recordedAt: 'desc' },
      take: this.cap,
    });
  }

  /**
   * Build a snapshot payload for one (tenant or global, kind) tuple.
   *
   * Matches the response shapes in `AIMonitoringService` so the API-side
   * `RedisAIMonitoringStore` can return them directly — see
   * `apps/api/src/services/AIMonitoringService.ts`.
   */
  private buildSnapshot(
    kind: SnapshotKind,
    events: AIMonitoringEventRow[],
    agg: WindowAggregates
  ): unknown {
    switch (kind) {
      case 'status':
        return this.buildStatusSnapshot(events, agg);
      case 'drift':
        return this.buildDriftSnapshot(events);
      case 'latency':
        return this.buildLatencySnapshot(agg);
      case 'hallucination':
        return this.buildHallucinationSnapshot(events);
      case 'roi':
        return this.buildROISnapshot(agg);
    }
  }

  private buildStatusSnapshot(events: AIMonitoringEventRow[], agg: WindowAggregates): unknown {
    const drift = events.filter((e) => e.eventType === 'drift');
    const hallucination = events.filter((e) => e.eventType === 'hallucination');

    const driftFlagged = drift.filter((e) => e.flagged).length;
    const hallucinationFlagged = hallucination.filter((e) => e.flagged).length;
    const hallucinationRate =
      hallucination.length > 0 ? hallucinationFlagged / hallucination.length : 0;
    const issues: string[] = [];
    if (driftFlagged > 0) issues.push(`${driftFlagged} drift detection(s) in window`);
    if (hallucinationRate > 0.05)
      issues.push(
        `Hallucination rate ${(hallucinationRate * 100).toFixed(1)}% exceeds 5% threshold`
      );

    const p95 = agg.latency?.p95 ?? 0;
    const p99 = agg.latency?.p99 ?? 0;

    const totalCost = agg.roi.costSum;
    const totalValue = agg.roi.valueSum;
    const currentROI = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    return {
      available: true,
      healthy: issues.length === 0,
      issues,
      drift: {
        trackedMetrics: drift.length,
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
        totalChecks: hallucination.length,
      },
      roi: { currentROI, totalCost, totalValue },
    };
  }

  private buildDriftSnapshot(events: AIMonitoringEventRow[]): unknown {
    const drift = events.filter((e) => e.eventType === 'drift');
    const driftFlagged = drift.filter((e) => e.flagged);
    const highSeverity = drift.filter((e) => e.severity === 'high' || e.severity === 'critical');
    return {
      available: true,
      status: {
        trackedMetrics: drift.length,
        totalSamples: drift.length,
        driftDetected: driftFlagged.length > 0,
        highSeverityCount: highSeverity.length,
        lastCheck: drift[0]?.recordedAt ?? null,
      },
      history: drift.map((e) => ({
        detected: e.flagged ?? false,
        severity: e.severity ?? 'none',
        metric: e.metric ?? e.model ?? 'unknown',
        driftScore: e.value ?? 0,
        pValue: pickField(e.payload, 'pValue', 1),
        timestamp: e.recordedAt,
        baselineWindow: pickField(e.payload, 'baselineWindow', null),
        currentWindow: pickField(e.payload, 'currentWindow', null),
        recommendations: pickField(e.payload, 'recommendations', [] as unknown[]),
      })),
    };
  }

  private buildLatencySnapshot(agg: WindowAggregates): unknown {
    const latency = agg.latency;
    if (!latency) {
      return {
        available: true,
        stats: emptyLatencyStats(),
        alerts: [],
      };
    }
    const { p95, p99 } = latency;
    return {
      available: true,
      stats: {
        periodStart: latency.oldest,
        periodEnd: latency.newest,
        sampleCount: latency.count,
        successRate: latency.ok / latency.count,
        percentiles: {
          p50: latency.p50,
          p75: latency.p75,
          p90: latency.p90,
          p95,
          p99,
          max: latency.max,
          min: latency.min,
          mean: latency.mean,
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
          complianceRate: latency.ok / latency.count,
        },
      },
      alerts: [],
    };
  }

  private buildHallucinationSnapshot(events: AIMonitoringEventRow[]): unknown {
    const hallucination = events.filter((e) => e.eventType === 'hallucination');
    const total = hallucination.length;
    const flagged = hallucination.filter((e) => e.flagged).length;
    return {
      available: true,
      stats: {
        totalChecks: total,
        hallucinationsDetected: flagged,
        hallucinationRate: total > 0 ? flagged / total : 0,
        byType: {},
        byModel: {},
        averageConfidence: 0,
        periodStart: hallucination[hallucination.length - 1]?.recordedAt ?? new Date(),
        periodEnd: hallucination[0]?.recordedAt ?? new Date(),
        kpiCompliant: total === 0 || flagged / total <= 0.05,
      },
      recentResults: hallucination.map((e) => ({
        id: pickField(e.payload, 'id', ''),
        timestamp: e.recordedAt,
        model: e.model ?? 'unknown',
        hallucinated: e.flagged ?? false,
        confidence: pickField(e.payload, 'confidence', 0),
        hallucinationTypes: pickField(e.payload, 'hallucinationTypes', [] as unknown[]),
        evidence: pickField(e.payload, 'evidence', [] as unknown[]),
        groundTruthSources: pickField(e.payload, 'groundTruthSources', [] as unknown[]),
        score: e.value ?? 0,
      })),
    };
  }

  private buildROISnapshot(agg: WindowAggregates): unknown {
    const { costCount, valueCount } = agg.roi;
    const totalCost = agg.roi.costSum;
    const totalValue = agg.roi.valueSum;
    const netValue = totalValue - totalCost;
    const roi = totalCost > 0 ? (netValue / totalCost) * 100 : 0;
    const now = new Date();
    return {
      available: true,
      roi: {
        periodStart: new Date(now.getTime() - this.lookbackMs),
        periodEnd: now,
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

function pickField<T>(payload: unknown, key: string, fallback: T): T {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return v as T;
  }
  return fallback;
}

function emptyLatencyStats() {
  const now = new Date();
  return {
    periodStart: now,
    periodEnd: now,
    sampleCount: 0,
    successRate: 1,
    percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0, min: 0, mean: 0, stdDev: 0 },
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
  };
}
