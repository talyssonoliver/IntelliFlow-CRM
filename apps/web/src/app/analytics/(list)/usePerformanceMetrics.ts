'use client';

/**
 * Data for Analytics: Performance (owner 26/11 mockup). The four KPIs for the chosen period and
 * the one before it, the booked-revenue trend for both periods aligned bucket by bucket, and the
 * material changes between them. Every figure comes from the analytics API.
 */

import { trpc } from '@/lib/trpc';
import {
  compare,
  materialChanges,
  previousRange,
  trendGranularity,
  type Comparison,
  type DateRange,
  type MaterialChange,
  type PeriodKey,
} from '@/lib/analytics/period-comparison';
import type { PeriodPoint } from './PeriodComparisonChart';

interface SalesFigures {
  pipelineValue: number;
  winRate: number;
  avgDealSize: number;
  avgSalesCycleDays: number | null;
  totalRevenue: number;
  closedWonCount: number;
  closedLostCount: number;
}

export interface PerformanceKpis {
  revenue: Comparison | null;
  winRate: Comparison | null;
  cycle: Comparison | null;
  pipeline: Comparison | null;
}

function pairOrNull(
  now: number | null | undefined,
  before: number | null | undefined,
  better: 'higher' | 'lower' = 'higher'
): Comparison | null {
  if (now == null || before == null) return null;
  return compare(now, before, better);
}

/** The four KPI comparisons; null where either period has no figure. */
export function performanceKpis(
  now: SalesFigures | undefined,
  before: SalesFigures | undefined
): PerformanceKpis {
  return {
    revenue: pairOrNull(now?.totalRevenue, before?.totalRevenue),
    winRate: pairOrNull(now?.winRate, before?.winRate),
    cycle: pairOrNull(now?.avgSalesCycleDays, before?.avgSalesCycleDays, 'lower'),
    pipeline: pairOrNull(now?.pipelineValue, before?.pipelineValue),
  };
}

/** Lines up the two periods bucket by bucket (the previous period may have fewer buckets). */
export function alignPeriods(
  now: readonly { periodLabel: string; value: number }[] | undefined,
  before: readonly { periodLabel: string; value: number }[] | undefined
): PeriodPoint[] {
  return (now ?? []).map((point, i) => ({
    label: point.periodLabel,
    current: point.value,
    previous: before?.[i]?.value ?? null,
  }));
}

export function performanceChanges(
  kpis: PerformanceKpis,
  money: (v: number) => string
): MaterialChange[] {
  const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
  const days = (v: number) => `${Math.round(v)} days`;
  const rows = [
    { label: 'Booked revenue', comparison: kpis.revenue, unit: '%' as const, format: money },
    { label: 'Win rate', comparison: kpis.winRate, unit: 'pp' as const, format: pct },
    { label: 'Sales cycle', comparison: kpis.cycle, unit: '%' as const, format: days },
    { label: 'Pipeline created', comparison: kpis.pipeline, unit: '%' as const, format: money },
  ];
  return materialChanges(
    rows.flatMap((r) => (r.comparison ? [{ ...r, comparison: r.comparison }] : []))
  );
}

function sumValues(points: readonly { value: number }[] | undefined): number | null {
  return points ? points.reduce((sum, p) => sum + p.value, 0) : null;
}

export function usePerformanceMetrics(range: DateRange, period: PeriodKey, enabled: boolean) {
  const before = previousRange(range);
  const granularity = trendGranularity(period);
  const sales = trpc.analytics.getSalesMetrics.useQuery(range, { enabled });
  const salesBefore = trpc.analytics.getSalesMetrics.useQuery(before, { enabled });
  const trend = trpc.analytics.getTimeSeriesData.useQuery(
    { metric: 'revenue', ...range, granularity },
    { enabled }
  );
  const trendBefore = trpc.analytics.getTimeSeriesData.useQuery(
    { metric: 'revenue', ...before, granularity },
    { enabled }
  );

  const pending = sales.isLoading || salesBefore.isLoading;
  const failed = (sales.isError && !sales.data) || (salesBefore.isError && !salesBefore.data);
  const kpis = performanceKpis(sales.data, salesBefore.data);

  return {
    now: sales.data,
    kpis,
    pending,
    failed,
    trend: {
      points: alignPeriods(trend.data, trendBefore.data),
      totalNow: sumValues(trend.data),
      totalBefore: sumValues(trendBefore.data),
      // Both periods (codex 27/11): a failed previous period no longer passes as "no data",
      // and retry refetches whichever request failed.
      pending: trend.isLoading || trendBefore.isLoading,
      failed: (trend.isError && !trend.data) || (trendBefore.isError && !trendBefore.data),
      retry: () => {
        // A failed refetch shows again as `failed`; nothing else to handle here.
        Promise.all([trend.refetch(), trendBefore.refetch()]).catch(() => undefined);
      },
    },
  };
}
