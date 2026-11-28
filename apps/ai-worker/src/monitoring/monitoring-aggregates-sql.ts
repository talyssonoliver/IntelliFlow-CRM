/**
 * Latency and ROI aggregates of one tenant's monitoring window, computed inside Postgres.
 *
 * RedisMonitoringPublisher used to read every `latency`, `roi_cost` and `roi_value` row of a
 * tenant into Node (up to 10,000 rows per tenant per publish) only to count them, sum them and
 * pick percentiles. Measured on prod on 27/11/2026 (EGRESS_LOG): ~190 rows / ~52 KB per call of
 * the combined worker's `AIMonitoringEvent.findMany`, the biggest worker spender on the free
 * Supabase plan. This file asks for the answer instead: one row of numbers per tenant.
 *
 * The rules are the ones the JavaScript used, line for line:
 *  - the window is the tenant's newest `cap` events of the five snapshot types by recordedAt
 *    (the old per-tenant `take` + `slice`); `cutoff` is the recordedAt of the cap-th one when the
 *    tenant has more than `cap`, so the rows read next can use the very same window;
 *  - a null value counts as 0 and a null flag as "not flagged" (`e.value ?? 0`, `!e.flagged`);
 *  - the p-th percentile of the sorted values is the value at 1-based position ceil(n * p / 100),
 *    written as (n * p + 99) / 100 in integer maths, the same rule AIMonitoringService uses;
 *  - sums are added by Postgres in another order than Node did, so they can differ in the last
 *    floating-point digit (the integration test compares them to 9 decimal places).
 *
 * Tenant scoping: this runs on the worker's plain client, exactly like the `findMany` calls it
 * replaces, and reads one tenant by an explicit `"tenantId" =` predicate (or `IS NULL` for the
 * global namespace). A raw query skips the tenant client's per-operation tenant binding
 * (waiting-sql.ts, #1596), but this reader is cross-tenant by design: it is the process that
 * builds every tenant's snapshot, so there is no single tenant to bind, and its predicate is
 * the tenant it is building for. It has the same database role (and so the same row level
 * security view) as the model reads next to it.
 *
 * @module monitoring/monitoring-aggregates-sql
 */
import type { PrismaClient } from '@intelliflow/db';

export interface LatencyAggregate {
  count: number;
  /** Events whose flag is not true. */
  ok: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  /** recordedAt of the oldest and the newest latency event in the window. */
  oldest: Date;
  newest: Date;
}

export interface RoiAggregate {
  costCount: number;
  costSum: number;
  valueCount: number;
  valueSum: number;
}

export interface WindowAggregates {
  /** null when the window holds no latency event. */
  latency: LatencyAggregate | null;
  roi: RoiAggregate;
  /** recordedAt of the cap-th newest event, only when the tenant has more than `cap` events. */
  cutoff: Date | null;
}

interface AggregateRow {
  n: number | bigint | null;
  ok: number | bigint | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  oldest: Date | string | null;
  newest: Date | string | null;
  cost_n: number | bigint | null;
  cost_sum: number | null;
  value_n: number | bigint | null;
  value_sum: number | null;
  cutoff: Date | string | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** A timestamp(3) without time zone is UTC; the driver hands it back as a Date or a string. */
const asDate = (v: Date | string): Date => {
  if (v instanceof Date) return v;
  return new Date(/(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(v) ? v : `${v.replace(' ', 'T')}Z`);
};

/**
 * Latency and ROI aggregates of `tenantId` (null = the global namespace) for events recorded at
 * or after `since`, over its newest `cap` events. Always returns exactly one row from the
 * database, whatever the event volume.
 */
export async function fetchWindowAggregates(
  prisma: PrismaClient,
  since: Date,
  tenantId: string | null,
  cap: number
): Promise<WindowAggregates> {
  const db = prisma as unknown as { $queryRaw: (...args: unknown[]) => Promise<AggregateRow[]> };
  const sinceMs = since.getTime();
  // Values, in order: since, tenant (twice), cap. Keep that order: the unit-test stub reads it.
  const rows = await db.$queryRaw`
    WITH ranked AS (
      SELECT "eventType" AS t, "recordedAt" AS r, value, flagged,
             row_number() OVER (ORDER BY "recordedAt" DESC) AS rk
      FROM ai_monitoring_events
      WHERE "recordedAt" >= (to_timestamp(${sinceMs}::double precision / 1000.0) AT TIME ZONE 'UTC')
        AND ("tenantId" = ${tenantId}::text OR (${tenantId}::text IS NULL AND "tenantId" IS NULL))
        AND "eventType" IN ('drift', 'hallucination', 'latency', 'roi_cost', 'roi_value')
    ), capped AS (
      SELECT * FROM ranked WHERE rk <= ${cap}::int
    ), lat AS (
      SELECT COALESCE(value, 0) AS v, COALESCE(flagged, false) AS f, r,
             row_number() OVER (ORDER BY COALESCE(value, 0)) AS rn, count(*) OVER () AS n
      FROM capped WHERE t = 'latency'
    ), latsum AS (
      SELECT
        (max(n))::int AS n,
        (count(*) FILTER (WHERE NOT f))::int AS ok,
        (avg(v))::float8 AS mean,
        (min(v))::float8 AS min,
        (max(v))::float8 AS max,
        (max(v) FILTER (WHERE rn = (n * 50 + 99) / 100))::float8 AS p50,
        (max(v) FILTER (WHERE rn = (n * 75 + 99) / 100))::float8 AS p75,
        (max(v) FILTER (WHERE rn = (n * 90 + 99) / 100))::float8 AS p90,
        (max(v) FILTER (WHERE rn = (n * 95 + 99) / 100))::float8 AS p95,
        (max(v) FILTER (WHERE rn = (n * 99 + 99) / 100))::float8 AS p99,
        min(r) AS oldest,
        max(r) AS newest
      FROM lat
    ), roi AS (
      SELECT
        (count(*) FILTER (WHERE t = 'roi_cost'))::int AS cost_n,
        (COALESCE(sum(COALESCE(value, 0)) FILTER (WHERE t = 'roi_cost'), 0))::float8 AS cost_sum,
        (count(*) FILTER (WHERE t = 'roi_value'))::int AS value_n,
        (COALESCE(sum(COALESCE(value, 0)) FILTER (WHERE t = 'roi_value'), 0))::float8 AS value_sum
      FROM capped
    )
    SELECT latsum.*, roi.*,
           (SELECT r FROM ranked WHERE rk = ${cap}::int) AS cutoff
    FROM latsum, roi`;

  const row = rows[0];
  const count = num(row?.n);
  const latency: LatencyAggregate | null =
    row && count > 0 && row.oldest && row.newest
      ? {
          count,
          ok: num(row.ok),
          mean: num(row.mean),
          min: num(row.min),
          max: num(row.max),
          p50: num(row.p50),
          p75: num(row.p75),
          p90: num(row.p90),
          p95: num(row.p95),
          p99: num(row.p99),
          oldest: asDate(row.oldest),
          newest: asDate(row.newest),
        }
      : null;
  return {
    latency,
    roi: {
      costCount: num(row?.cost_n),
      costSum: num(row?.cost_sum),
      valueCount: num(row?.value_n),
      valueSum: num(row?.value_sum),
    },
    cutoff: row?.cutoff ? asDate(row.cutoff) : null,
  };
}
