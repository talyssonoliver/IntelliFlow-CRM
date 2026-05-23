/**
 * RedisMonitoringPublisher (IFC-214)
 *
 * Publishes tenant-scoped AI monitoring snapshots to Redis on a short cadence
 * so the API can serve dashboard reads from a low-latency cache instead of
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
 * @module monitoring/redis-monitoring-publisher
 * @task IFC-214
 * @see docs/architecture/adr/ADR-052-redis-monitoring-snapshot-bridge.md
 * @see .specify/sprints/sprint-18/specifications/IFC-214-spec.md
 */

import pino from 'pino';
import type { PrismaClient } from '@intelliflow/db';

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
}

export type SnapshotKind = 'status' | 'drift' | 'latency' | 'hallucination' | 'roi';

const SNAPSHOT_KINDS: readonly SnapshotKind[] = [
  'status',
  'drift',
  'latency',
  'hallucination',
  'roi',
];

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
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisLike | null,
    private readonly prisma: PrismaClient,
    opts: RedisMonitoringPublisherOptions = {}
  ) {
    this.intervalMs =
      opts.intervalMs ?? (Number(process.env.AI_MONITORING_REDIS_PUBLISH_INTERVAL_MS) || 5000);
    this.ttlSeconds =
      opts.ttlSeconds ?? (Number(process.env.AI_MONITORING_REDIS_TTL_SECONDS) || 30);
    this.disabled =
      opts.disabled ?? (process.env.AI_MONITORING_REDIS_DISABLED === '1' || redis === null);
    this.lookbackMs = opts.lookbackMs ?? 24 * 60 * 60 * 1000;
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
    const tenantIds = await this.fetchActiveTenants(since); // includes `null` if global drift events present

    let written = 0;
    let skipped = 0;
    const redis = this.redis;

    for (const tenantId of tenantIds) {
      const namespace = tenantId ?? GLOBAL_NAMESPACE;
      const ns_events = await this.fetchEventsForTenant(since, tenantId);
      // Global namespace ONLY publishes the drift snapshot — the other 4 kinds
      // are tenant-scoped by definition (see AIMonitoringService.tenantFilter).
      const kindsForNs: readonly SnapshotKind[] =
        namespace === GLOBAL_NAMESPACE ? (['drift'] as const) : SNAPSHOT_KINDS;

      for (const kind of kindsForNs) {
        const payload = this.buildSnapshot(kind, ns_events);
        const key = redisKey(namespace, kind);
        try {
          await redis.set(key, JSON.stringify(payload), 'EX', this.ttlSeconds);
          written += 1;
        } catch (err) {
          skipped += 1;
          logger.warn(
            { key, err: err instanceof Error ? err.message : err },
            'redis.set failed — snapshot skipped'
          );
        }
      }
    }

    return { written, skipped };
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
   * Fetch events for a single tenant (or global, when tenantId === null).
   * `take: 10000` is now a PER-TENANT cap, not a global one.
   */
  private async fetchEventsForTenant(
    since: Date,
    tenantId: string | null
  ): Promise<AIMonitoringEventRow[]> {
    const db = this.prisma as unknown as {
      aIMonitoringEvent: {
        findMany: (args: unknown) => Promise<AIMonitoringEventRow[]>;
      };
    };
    return db.aIMonitoringEvent.findMany({
      where: { recordedAt: { gte: since }, tenantId },
      orderBy: { recordedAt: 'desc' },
      take: 10000,
    });
  }

  /**
   * Build a snapshot payload for one (tenant or global, kind) tuple.
   *
   * Matches the response shapes in `AIMonitoringService` so the API-side
   * `RedisAIMonitoringStore` can return them directly — see
   * `apps/api/src/services/AIMonitoringService.ts`.
   */
  private buildSnapshot(kind: SnapshotKind, events: AIMonitoringEventRow[]): unknown {
    switch (kind) {
      case 'status':
        return this.buildStatusSnapshot(events);
      case 'drift':
        return this.buildDriftSnapshot(events);
      case 'latency':
        return this.buildLatencySnapshot(events);
      case 'hallucination':
        return this.buildHallucinationSnapshot(events);
      case 'roi':
        return this.buildROISnapshot(events);
    }
  }

  private buildStatusSnapshot(events: AIMonitoringEventRow[]): unknown {
    const drift = events.filter((e) => e.eventType === 'drift');
    const latency = events.filter((e) => e.eventType === 'latency');
    const hallucination = events.filter((e) => e.eventType === 'hallucination');
    const roiCost = events.filter((e) => e.eventType === 'roi_cost');
    const roiValue = events.filter((e) => e.eventType === 'roi_value');

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

    const latencyValues = latency.map((e) => e.value ?? 0).sort((a, b) => a - b);
    const pct = (arr: number[], p: number): number =>
      arr.length > 0 ? (arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0) : 0;
    const p95 = pct(latencyValues, 95);
    const p99 = pct(latencyValues, 99);

    const totalCost = roiCost.reduce((s, e) => s + (e.value ?? 0), 0);
    const totalValue = roiValue.reduce((s, e) => s + (e.value ?? 0), 0);
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

  private buildLatencySnapshot(events: AIMonitoringEventRow[]): unknown {
    const latency = events.filter((e) => e.eventType === 'latency');
    if (latency.length === 0) {
      return {
        available: true,
        stats: emptyLatencyStats(),
        alerts: [],
      };
    }
    const durations = latency.map((e) => e.value ?? 0).sort((a, b) => a - b);
    const successCount = latency.filter((e) => !e.flagged).length;
    const percentile = (arr: number[], p: number): number =>
      arr[Math.ceil((arr.length * p) / 100) - 1] ?? 0;
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);
    return {
      available: true,
      stats: {
        periodStart: latency[latency.length - 1]?.recordedAt ?? new Date(),
        periodEnd: latency[0]?.recordedAt ?? new Date(),
        sampleCount: latency.length,
        successRate: successCount / latency.length,
        percentiles: {
          p50: percentile(durations, 50),
          p75: percentile(durations, 75),
          p90: percentile(durations, 90),
          p95,
          p99,
          max: durations[durations.length - 1] ?? 0,
          min: durations[0] ?? 0,
          mean: durations.reduce((a, b) => a + b, 0) / durations.length,
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
          complianceRate: successCount / latency.length,
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

  private buildROISnapshot(events: AIMonitoringEventRow[]): unknown {
    const costs = events.filter((e) => e.eventType === 'roi_cost');
    const values = events.filter((e) => e.eventType === 'roi_value');
    const totalCost = costs.reduce((s, e) => s + (e.value ?? 0), 0);
    const totalValue = values.reduce((s, e) => s + (e.value ?? 0), 0);
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
        totalCostsTracked: costs.length,
        totalValuesTracked: values.length,
        currentROI: roi,
        averageCostPerOperation: costs.length > 0 ? totalCost / costs.length : 0,
        averageValuePerOperation: values.length > 0 ? totalValue / values.length : 0,
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
