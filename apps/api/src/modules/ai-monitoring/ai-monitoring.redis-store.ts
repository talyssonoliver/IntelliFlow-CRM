/**
 * RedisAIMonitoringStore (IFC-214)
 *
 * Reads tenant-scoped AI monitoring snapshots from Redis (populated by the
 * `RedisMonitoringPublisher` in the ai-worker process — see
 * `apps/ai-worker/src/monitoring/redis-monitoring-publisher.ts`). Falls
 * through to the DB-backed `AIMonitoringService` (IFC-297) when the
 * snapshot is missing, malformed, or the Redis client errors.
 *
 * R-016 (Cache Poisoning) controls applied at READ time:
 *   1. Tenant-scoped key namespacing — never reads across tenant boundary.
 *   2. Zod schema validation — malformed payloads fall through to DB.
 *   3. Schema version prefix `v1` in the key — legacy/future shapes invisible.
 *
 * Outage discipline: every Redis exception is swallowed; never throws.
 *
 * @module modules/ai-monitoring/ai-monitoring.redis-store
 * @task IFC-214
 * @see docs/architecture/adr/ADR-052-redis-monitoring-snapshot-bridge.md
 * @see .specify/sprints/sprint-18/specifications/IFC-214-spec.md
 */

import { z } from 'zod';
import type { AIMonitoringService } from '../../services/AIMonitoringService';

const SCHEMA_VERSION = 'v1';
const KEY_PREFIX = 'ai-mon';
const GLOBAL_NAMESPACE = 'global';

export type SnapshotKind = 'status' | 'drift' | 'latency' | 'hallucination' | 'roi';

/**
 * Build a Redis key. Format: `ai-mon:v1:{tenantId|global}:{kind}`.
 * Tenant ID is the SOLE namespace input — no other request fields participate.
 * (This is R-016 control 1 — tested by T-A6.)
 */
function redisKey(tenantId: string, kind: SnapshotKind): string {
  return `${KEY_PREFIX}:${SCHEMA_VERSION}:${tenantId}:${kind}`;
}

/**
 * Minimal Redis interface — only `get` is required.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
}

// ============================================================================
// Snapshot Zod schemas — match `AIMonitoringService` response shapes
// ============================================================================

const statusSnapshotSchema = z.object({
  available: z.boolean(),
  healthy: z.boolean(),
  issues: z.array(z.string()),
  drift: z.object({
    trackedMetrics: z.number(),
    driftDetected: z.boolean(),
    highSeverityCount: z.number(),
  }),
  latency: z.object({
    sloCompliant: z.boolean(),
    p95: z.number(),
    p99: z.number(),
  }),
  hallucination: z.object({
    rate: z.number(),
    kpiCompliant: z.boolean(),
    totalChecks: z.number(),
  }),
  roi: z.object({
    currentROI: z.number(),
    totalCost: z.number(),
    totalValue: z.number(),
  }),
});

const driftSnapshotSchema = z.object({
  available: z.boolean(),
  status: z.object({
    trackedMetrics: z.number(),
    totalSamples: z.number(),
    driftDetected: z.boolean(),
    highSeverityCount: z.number(),
    lastCheck: z.union([z.string(), z.date(), z.null()]),
  }),
  history: z.array(z.unknown()),
});

const latencySnapshotSchema = z.object({
  available: z.boolean(),
  stats: z.object({
    sampleCount: z.number(),
    successRate: z.number(),
    percentiles: z.object({
      p50: z.number(),
      p75: z.number(),
      p90: z.number(),
      p95: z.number(),
      p99: z.number(),
      max: z.number(),
      min: z.number(),
      mean: z.number(),
      stdDev: z.number(),
    }),
    sloCompliance: z.object({
      p95Target: z.number(),
      p99Target: z.number(),
      p95Actual: z.number(),
      p99Actual: z.number(),
      p95Compliant: z.boolean(),
      p99Compliant: z.boolean(),
      overallCompliant: z.boolean(),
      complianceRate: z.number(),
    }),
  }).passthrough(),
  alerts: z.array(z.unknown()),
});

const hallucinationSnapshotSchema = z.object({
  available: z.boolean(),
  stats: z.object({
    totalChecks: z.number(),
    hallucinationsDetected: z.number(),
    hallucinationRate: z.number(),
    kpiCompliant: z.boolean(),
  }).passthrough(),
  recentResults: z.array(z.unknown()),
});

const roiSnapshotSchema = z.object({
  available: z.boolean(),
  roi: z.object({
    totalCost: z.number(),
    totalValue: z.number(),
    netValue: z.number(),
    roi: z.number(),
  }).passthrough(),
  stats: z.object({
    totalCostsTracked: z.number(),
    totalValuesTracked: z.number(),
    currentROI: z.number(),
  }).passthrough(),
});

// ============================================================================
// Store
// ============================================================================

interface TenantOpts {
  tenantId: string;
}
interface DateRangeOpts {
  startTime?: Date;
  endTime?: Date;
}
interface DriftMetricsOpts extends DateRangeOpts {
  limit?: number;
  model?: string;
  metric?: string;
}
type LatencyMetricsOpts = DateRangeOpts & { model?: string };
interface HallucinationReportOpts extends DateRangeOpts { limit?: number }
type ROIMetricsOpts = DateRangeOpts;

/**
 * The publisher precomputes ONE snapshot per (tenant, kind) over the lookback
 * window with NO user filters applied. So a cache hit is only valid when the
 * caller's request has no filters either. Any non-default filter (date range,
 * limit, model, metric) MUST bypass the cache and call the DB-backed service.
 *
 * This gates Lens-1 risk #1 from the post-attestation audit: returning a 24h
 * aggregate to a "last hour"/`limit: 20` request would silently violate query
 * semantics. Honest fix is to scope the cache to the no-filter request path.
 */
function hasFilters(
  opts: Partial<DateRangeOpts> & {
    limit?: number;
    model?: string;
    metric?: string;
  },
): boolean {
  return (
    opts.startTime !== undefined ||
    opts.endTime !== undefined ||
    opts.limit !== undefined ||
    opts.model !== undefined ||
    opts.metric !== undefined
  );
}

export interface StoreResult<T> {
  source: 'redis' | 'db';
  value: T;
  /** Internal — set in tests; suppressed from router output. */
  notes?: string;
}

// Mirror the AIMonitoringService method return shapes so tRPC type inference
// in the router test pool stays consistent with the pre-IFC-214 behaviour.
//
// Note: cache-hit values are JSON-deserialized — Date fields arrive as ISO
// strings, not Date instances. tRPC has no superjson transformer
// (apps/api/src/trpc.ts) so the wire shape is already string-typed; clients
// already treat date fields as strings. The Awaited<ReturnType<…>> aliases
// are a structural mirror, not a runtime contract — internal consumers that
// need a Date should call `new Date(x)` rather than rely on `instanceof Date`.
type StatusValue = Awaited<ReturnType<AIMonitoringService['getStatus']>>;
type DriftValue = Awaited<ReturnType<AIMonitoringService['getDriftMetrics']>>;
type LatencyValue = Awaited<ReturnType<AIMonitoringService['getLatencyMetrics']>>;
type HallucinationValue = Awaited<ReturnType<AIMonitoringService['getHallucinationReport']>>;
type ROIValue = Awaited<ReturnType<AIMonitoringService['getROIMetrics']>>;

export interface RedisAIMonitoringStoreDeps {
  redis: RedisLike | null;
  service: AIMonitoringService;
  opts?: { disabled?: boolean };
}

/**
 * Reads monitoring snapshots from Redis with DB fall-through.
 *
 * Wired into `apps/api/src/container.ts` next to `aiMonitoringService` and
 * exposed on `ctx.services` at `apps/api/src/context.ts`. The router at
 * `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts` is the
 * production caller.
 */
export class RedisAIMonitoringStore {
  private readonly redis: RedisLike | null;
  private readonly service: AIMonitoringService;
  private readonly disabled: boolean;

  constructor(deps: RedisAIMonitoringStoreDeps) {
    this.redis = deps.redis;
    this.service = deps.service;
    this.disabled =
      deps.opts?.disabled ??
      (process.env.AI_MONITORING_REDIS_DISABLED === '1' || deps.redis === null);
  }

  async getStatus(opts: TenantOpts): Promise<StoreResult<StatusValue>> {
    // getStatus has no user filters — always cache-eligible.
    return this.readOrFallback<StatusValue>('status', opts.tenantId, statusSnapshotSchema, () =>
      this.service.getStatus(opts),
    );
  }

  async getDriftMetrics(
    opts: DriftMetricsOpts & TenantOpts,
  ): Promise<StoreResult<DriftValue>> {
    if (this.disabled || !this.redis || hasFilters(opts)) {
      // Filtered request → bypass cache, go to DB. The publisher precomputes
      // an unfiltered 24h aggregate; serving it for a "limit: 20" or
      // "startTime: …" request would lie to the caller.
      return { source: 'db', value: await this.service.getDriftMetrics(opts) };
    }
    // Drift merge: tenant + global
    const tenantSnap = await this.tryGet(redisKey(opts.tenantId, 'drift'), driftSnapshotSchema);
    const globalSnap = await this.tryGet(
      redisKey(GLOBAL_NAMESPACE, 'drift'),
      driftSnapshotSchema,
    );
    if (!tenantSnap && !globalSnap) {
      return { source: 'db', value: await this.service.getDriftMetrics(opts) };
    }
    // Single TYPE BOUNDARY for the drift path — same safety argument as
    // readOrFallback's cast doc-block (Zod-validated wire shape; runtime
    // contract is the schema, not the type alias).
    return { source: 'redis', value: mergeDriftSnapshots(tenantSnap, globalSnap) as DriftValue };
  }

  async getLatencyMetrics(
    opts: LatencyMetricsOpts & TenantOpts,
  ): Promise<StoreResult<LatencyValue>> {
    if (hasFilters(opts)) {
      return { source: 'db', value: await this.service.getLatencyMetrics(opts) };
    }
    return this.readOrFallback<LatencyValue>(
      'latency',
      opts.tenantId,
      latencySnapshotSchema,
      () => this.service.getLatencyMetrics(opts),
    );
  }

  async getHallucinationReport(
    opts: HallucinationReportOpts & TenantOpts,
  ): Promise<StoreResult<HallucinationValue>> {
    if (hasFilters(opts)) {
      return { source: 'db', value: await this.service.getHallucinationReport(opts) };
    }
    return this.readOrFallback<HallucinationValue>(
      'hallucination',
      opts.tenantId,
      hallucinationSnapshotSchema,
      () => this.service.getHallucinationReport(opts),
    );
  }

  async getROIMetrics(
    opts: ROIMetricsOpts & TenantOpts,
  ): Promise<StoreResult<ROIValue>> {
    if (hasFilters(opts)) {
      return { source: 'db', value: await this.service.getROIMetrics(opts) };
    }
    return this.readOrFallback<ROIValue>('roi', opts.tenantId, roiSnapshotSchema, () =>
      this.service.getROIMetrics(opts),
    );
  }

  /**
   * Read-or-fallback driver. The single TYPE BOUNDARY cast in this whole file
   * lives at the `parsed as T` line below. It is safe because:
   *   1. Zod's `safeParse` ran inside `tryGet` and returned only on success.
   *   2. The caller's `T` is the AIMonitoringService method's return alias,
   *      and the per-snapshot Zod schemas mirror that wire shape (with
   *      string-typed Dates per JSON-deserialization semantics).
   *   3. tRPC has no superjson transformer (apps/api/src/trpc.ts) so the
   *      router serialises Date as ISO string anyway — the runtime contract
   *      is the same as a DB-served call.
   * If the schema and the alias drift, the unit tests T-A1..T-A5 (cache hit
   * shape assertions) will fail, not silently mis-type.
   */
  private async readOrFallback<T>(
    kind: SnapshotKind,
    tenantId: string,
    schema: z.ZodTypeAny,
    dbFn: () => Promise<T>,
  ): Promise<StoreResult<T>> {
    if (this.disabled || !this.redis) {
      return { source: 'db', value: await dbFn() };
    }
    const parsed = await this.tryGet(redisKey(tenantId, kind), schema);
    if (parsed === null) {
      return { source: 'db', value: await dbFn() };
    }
    return { source: 'redis', value: parsed as T };
  }

  /**
   * Tries a Redis GET + JSON.parse + Zod validation. Returns null on:
   *   - Redis throw (outage)
   *   - missing key
   *   - JSON parse error
   *   - Zod validation failure (poisoned payload — R-016 control 2)
   * Never throws. Returns `unknown | null` so the cast at `readOrFallback`
   * is the single, documented type boundary.
   */
  private async tryGet(key: string, schema: z.ZodTypeAny): Promise<unknown | null> {
    const redis = this.redis;
    if (!redis) return null;
    let raw: string | null;
    try {
      raw = await redis.get(key);
    } catch {
      return null;
    }
    if (raw === null || raw === undefined) return null;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = schema.safeParse(json);
    if (!result.success) return null;
    return result.data;
  }
}

/**
 * Merge tenant + global drift snapshots into a single response. Inputs are
 * `unknown` because they come straight from `tryGet` (Zod-validated wire
 * shape — Date fields are JSON strings). The function builds a structurally
 * identical merged shape and crosses the single type boundary in
 * `getDriftMetrics` via `as T` (see `readOrFallback` doc-block for safety
 * argument). This function itself returns `unknown` so the boundary cast
 * stays in exactly one place.
 */
function mergeDriftSnapshots(tenant: unknown, global: unknown): unknown {
  const t = tenant as { status?: { highSeverityCount?: number; trackedMetrics?: number }; history?: { timestamp?: string | Date }[] } | null;
  const g = global as { status?: { highSeverityCount?: number; trackedMetrics?: number }; history?: { timestamp?: string | Date }[] } | null;
  const tHist = t?.history ?? [];
  const gHist = g?.history ?? [];
  const history = [...tHist, ...gHist].sort((a, b) => {
    const at = new Date(a?.timestamp ?? 0).getTime();
    const bt = new Date(b?.timestamp ?? 0).getTime();
    return bt - at;
  });
  const tHigh = t?.status?.highSeverityCount ?? 0;
  const gHigh = g?.status?.highSeverityCount ?? 0;
  const tracked = (t?.status?.trackedMetrics ?? 0) + (g?.status?.trackedMetrics ?? 0);
  return {
    available: true,
    status: {
      trackedMetrics: tracked,
      totalSamples: tracked,
      driftDetected: tHigh + gHigh > 0,
      highSeverityCount: tHigh + gHigh,
      lastCheck: history[0]?.timestamp ?? null,
    },
    history,
  };
}

// Test-only export: allow tests to inspect Zod schemas directly.
export const __test = {
  redisKey,
  schemas: {
    status: statusSnapshotSchema,
    drift: driftSnapshotSchema,
    latency: latencySnapshotSchema,
    hallucination: hallucinationSnapshotSchema,
    roi: roiSnapshotSchema,
  },
};
