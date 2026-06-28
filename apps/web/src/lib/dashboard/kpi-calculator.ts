/**
 * Dashboard KPI Calculator
 *
 * Pure, framework-agnostic derivation + formatting helpers for the dashboard
 * KPI widgets. These functions extract the presentation-layer math that was
 * previously duplicated inline across the widgets in
 * `apps/web/src/components/dashboard/widgets/`. They take data already returned
 * by existing tRPC procedures (analytics / lead / opportunity / ticket) and
 * derive display values — they perform NO network I/O and hold NO business
 * rules (win rate, conversion rate, YoY etc. stay server-authoritative per
 * ADR-016). Null/undefined/zero-denominator inputs resolve to safe sentinels
 * (0 / floor) — never Infinity, NaN, or a placeholder string (prd-core-crm.md).
 *
 * Task: PG-058 — Dashboard
 */

/**
 * Shared dashboard polling cadence (ms). Matches the global React Query
 * `staleTime` (`packages/api-client/src/react-client.tsx`) and the existing
 * `useActivityFeed` poll (`apps/web/src/hooks/useActivityFeed.ts:96`); it is
 * >= the server `DASHBOARD_STATS` cache life so polling never amplifies past
 * one refetch per interval per deduplicated query key.
 */
export const DASHBOARD_REFETCH_INTERVAL_MS = 60_000;

/** Coerce a tRPC wire value (number, Prisma Decimal string, or nullish) to a
 *  finite number; non-finite/empty/nullish → 0. */
function toFiniteNumber(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? (n as number) : 0;
}

/**
 * Period-over-period percentage change.
 *
 * Returns an UNROUNDED float so each caller can apply its own precision
 * (`TotalLeadsWidget` rounds to an integer; `RevenueWidget` uses `.toFixed(1)`).
 * Zero-safe: when the previous-period value is `<= 0` (e.g. growth from zero),
 * returns `0` rather than `Infinity`/`NaN`.
 */
export function computeDeltaPercent(delta: number, previous: number): number {
  if (!Number.isFinite(delta) || !Number.isFinite(previous) || previous <= 0) {
    return 0;
  }
  return (delta / previous) * 100;
}

/**
 * Trend direction for a signed delta. `delta >= 0` is treated as "up" /
 * "On track" — zero change counts as on-track (documented product decision,
 * mirrors `SalesRevenueWidget`'s original `delta >= 0`).
 */
export function isTrendingUp(delta: number): boolean {
  return Number.isFinite(delta) && delta >= 0;
}

/**
 * Count of urgent tickets = SLA `AT_RISK` + `BREACHED`. Null-safe against a
 * partial or absent `bySLAStatus` map.
 */
export function computeTicketUrgent(bySLAStatus?: {
  AT_RISK?: number | null;
  BREACHED?: number | null;
}): number {
  return toFiniteNumber(bySLAStatus?.AT_RISK) + toFiniteNumber(bySLAStatus?.BREACHED);
}

/**
 * A pipeline stage's share of the total pipeline value, as a rounded integer
 * percentage `0-100+`. Accepts `number | string` (opportunity money fields
 * arrive as Prisma Decimal strings over the wire). Zero-safe: `total <= 0`
 * returns `0` (no `|| 1` floor — empty pipeline shows 0%, not a phantom slice).
 */
export function computePipelineStagePercent(
  stageValue: number | string,
  total: number | string
): number {
  const t = toFiniteNumber(total);
  if (t <= 0) return 0;
  return Math.round((toFiniteNumber(stageValue) / t) * 100);
}

/**
 * Max value for bar-chart height scaling, floored at `1` so it is always a
 * safe divisor (empty / all-zero series → `1`). Non-finite entries are coerced
 * to `0`.
 */
export function chartMax(values: number[]): number {
  if (!Array.isArray(values) || values.length === 0) return 1;
  return Math.max(1, ...values.map(toFiniteNumber));
}

/**
 * Bar height as a percentage of `max`, floored at `minPercent` (default `2`,
 * so non-zero bars stay visible). `max <= 0` → `minPercent`.
 */
export function computeBarHeightPercent(value: number, max: number, minPercent = 2): number {
  const m = toFiniteNumber(max);
  if (m <= 0) return minPercent;
  return Math.max((toFiniteNumber(value) / m) * 100, minPercent);
}

/**
 * Format an amount as an en-GB GBP currency string (no fractional digits by
 * default). Own implementation — intentionally NOT shared with
 * `lib/pricing/calculator.ts` to avoid coupling the dashboard to the billing
 * domain. Mirrors the inline `toLocaleString('en-GB', { style: 'currency',
 * currency: 'GBP', maximumFractionDigits: 0 })` the widgets used.
 */
export function formatGBP(amount: number | string, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toFiniteNumber(amount));
}
