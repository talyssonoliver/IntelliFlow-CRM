'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

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

  const { data: overview } = trpc.analytics.getOverview.useQuery({});
  const { data: timeSeries, isLoading } = trpc.analytics.getTimeSeriesData.useQuery({
    metric: 'revenue',
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: timeRange === 'week' ? 'day' : 'month',
  });

  const totalRevenue = Number(overview?.totalRevenue ?? 0);
  const revenueDelta = Number(overview?.revenueDelta ?? 0);
  const previous = totalRevenue - revenueDelta;
  const deltaPercent = previous > 0 ? (revenueDelta / previous) * 100 : 0;

  const points = Array.isArray(timeSeries) ? timeSeries : [];
  const maxValue = Math.max(...points.map((p: Record<string, unknown>) => Number(p.value || 0)), 1);

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
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {isLoading
                ? '...'
                : totalRevenue.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  })}
            </span>
            {deltaPercent !== 0 && (
              <span
                className={`text-xs font-medium flex items-center px-1.5 py-0.5 rounded ${
                  deltaPercent >= 0
                    ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                    : 'text-red-500 bg-red-50 dark:bg-red-500/10'
                }`}
              >
                {deltaPercent >= 0 ? '+' : ''}
                {deltaPercent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="flex-1 flex items-end justify-between gap-1 w-full px-2">
        {points.length > 0 ? (
          points.map((point: Record<string, unknown>, i: number) => {
            const value = Number(point.value || 0);
            const height = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 2;
            const isLast = i === points.length - 1;
            return (
              <div
                key={i}
                className={`w-full rounded-t-sm transition-all ${isLast ? 'bg-ds-primary' : 'bg-ds-primary/40'}`}
                style={{ height: `${height}%` }}
              />
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'No data'}
          </div>
        )}
      </div>

      {/* X-axis labels */}
      {points.length > 0 && (
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          {dayLabels.slice(0, points.length).map((label: string, i: number) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
