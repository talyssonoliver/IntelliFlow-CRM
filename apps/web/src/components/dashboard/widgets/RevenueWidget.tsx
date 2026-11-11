'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { isEmptySeries } from '@/lib/charts/empty-series';
import { ChartEmptyState, ChartUnavailable } from '@/components/shared/ChartEmptyState';
import {
  chartMax,
  computeBarHeightPercent,
  computeDeltaPercent,
  formatGBP,
} from '@/lib/dashboard/kpi-calculator';
import { KpiTrendBadge } from '../KpiCard';
import type { WidgetProps } from './index';

/** Below £100 last period a revenue percentage is noise (#1225 UI-009). */
const REVENUE_TREND_MIN_BASELINE = 100;

function revenueFigure(pending: boolean, failed: boolean, total: number): string {
  if (failed) return 'Unavailable';
  if (pending) return '...';
  return formatGBP(total);
}

export function RevenueWidget({ config }: Readonly<WidgetProps>) {
  const timeRange = (config?.timeRange as string) || 'month';

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (timeRange === 'week') {
      start.setUTCDate(start.getUTCDate() - 7);
    } else {
      start.setMonth(start.getMonth() - 1);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [timeRange]);

  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewFailed,
  } = trpc.analytics.getOverview.useQuery({});
  const {
    data: timeSeries,
    isLoading,
    isError: seriesFailed,
    refetch,
  } = trpc.analytics.getTimeSeriesData.useQuery({
    metric: 'revenue',
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: timeRange === 'week' ? 'day' : 'month',
  });

  // A failed background refresh keeps the figures already loaded (React Query keeps
  // `data`); "Couldn't load" is only for a request that never produced any.
  const overviewError = overviewFailed && !overview;
  const isError = seriesFailed && !timeSeries;

  // The revenue figure comes from `overview`, not the time-series query — gate
  // on the overview's own state so a missing overview never shows a fake £0.
  // A failed overview says so instead of waiting forever on "...".
  const revenuePending = !overviewError && (overviewLoading || !overview);
  const totalRevenue = Number(overview?.totalRevenue ?? 0);
  const revenueDelta = Number(overview?.revenueDelta ?? 0);
  const previous = totalRevenue - revenueDelta;
  const deltaPercent = computeDeltaPercent(revenueDelta, previous);

  const points = Array.isArray(timeSeries) ? timeSeries : [];
  const hasPoints = !isError && !isEmptySeries(points, 'value');
  const maxValue = chartMax(points.map((p: Record<string, unknown>) => Number(p.value || 0)));

  const dayLabels =
    timeRange === 'week'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : points.map((_: unknown, i: number) => `W${i + 1}`);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-slate-900 dark:text-white font-semibold">Total Revenue</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {revenueFigure(revenuePending, overviewError, totalRevenue)}
            </span>
            <KpiTrendBadge
              deltaPercent={deltaPercent}
              previous={previous}
              minBaseline={REVENUE_TREND_MIN_BASELINE}
              fractionDigits={1}
              appearance="pill"
            />
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="flex-1 flex items-end justify-between gap-1 w-full px-2">
        {hasPoints &&
          points.map((point: Record<string, unknown>, i: number) => {
            const value = Number(point.value || 0);
            const height = computeBarHeightPercent(value, maxValue);
            const isLast = i === points.length - 1;
            return (
              <div
                key={i}
                className={`w-full rounded-t-sm transition-all ${isLast ? 'bg-ds-primary' : 'bg-ds-primary/40'}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        {!hasPoints && isLoading && !isError && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
        {isError && (
          <ChartUnavailable message="Couldn't load revenue." onRetry={() => void refetch()} />
        )}
        {!hasPoints && !isLoading && !isError && (
          <ChartEmptyState message="No revenue in this period yet" />
        )}
      </div>

      {/* X-axis labels */}
      {hasPoints && (
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          {dayLabels.slice(0, points.length).map((label: string, i: number) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
