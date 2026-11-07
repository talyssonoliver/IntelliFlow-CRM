'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { isEmptySeries } from '@/lib/charts/empty-series';
import { ChartEmptyState } from '@/components/shared/ChartEmptyState';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  chartMax,
  computeBarHeightPercent,
} from '@/lib/dashboard/kpi-calculator';
import type { WidgetProps } from './index';

interface DealsWonData {
  month: string;
  value: number;
  revenue?: number;
}

/** #1225 UI-014: the range select drives the query (it used to be decorative). */
export const DEALS_WON_RANGES = [
  { months: 6, label: 'Last 6 Months' },
  { months: 12, label: 'Last 12 Months' },
] as const;

export type DealsWonMonths = (typeof DEALS_WON_RANGES)[number]['months'];

export function DealsWonWidget(_props: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [months, setMonths] = useState<DealsWonMonths>(6);
  const {
    data: chartData,
    isLoading,
    isError,
    refetch,
  } = trpc.analytics.dealsWonTrend.useQuery(
    { months },
    {
      enabled: isAuthenticated && !authLoading,
      // Slow-moving monthly trend — poll less often than the live stat cards.
      refetchInterval: 5 * DASHBOARD_REFETCH_INTERVAL_MS,
    }
  );

  if (isLoading || authLoading) {
    return (
      <div className="p-6 h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-8 w-32 rounded bg-muted" />
        </div>
        <div className="flex items-end justify-between h-48 gap-4 px-4 flex-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-1">
              <div className="w-full h-40 rounded-t bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // A failed request is not a zero: only a successful empty answer says "no deals".
  const empty = !isError && isEmptySeries(chartData, 'value');
  const rows: DealsWonData[] = empty || isError ? [] : (chartData as DealsWonData[]);
  const maxValue = chartMax(rows.map((d) => d.value));

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Deals Won</h3>
        <select
          aria-label="Select deals-won time range"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) as DealsWonMonths)}
          className="px-2 py-1 text-sm border border-border rounded bg-card text-foreground"
        >
          {DEALS_WON_RANGES.map((r) => (
            <option key={r.months} value={r.months}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bar Chart */}
      {isError && <DealsWonUnavailable onRetry={() => void refetch()} />}
      {!isError && empty && (
        <ChartEmptyState className="h-48" message="No deals won in this period yet" />
      )}
      {!isError && !empty && (
        <div
          className={`flex items-end justify-between h-48 flex-1 ${
            rows.length > 6 ? 'gap-1 sm:gap-2 px-0 sm:px-2' : 'gap-2 sm:gap-4 px-2 sm:px-4'
          }`}
        >
          {rows.map((item: DealsWonData, index: number) => {
            const height = computeBarHeightPercent(item.value, maxValue, 0);
            const isLast = index === rows.length - 1;

            return (
              <div
                key={`${item.month}-${index}`}
                className="flex flex-col items-center gap-2 flex-1"
              >
                <div className="w-full h-40 flex items-end">
                  <div
                    className={`w-full rounded-t motion-safe:transition-all ${
                      isLast ? 'bg-primary' : 'bg-primary/60'
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${item.value} deals won`}
                  />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">{item.month}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Shown when the deals-won request fails: says so and offers a retry. */
function DealsWonUnavailable({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div
      role="alert"
      data-testid="deals-won-error"
      className="flex h-48 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground"
    >
      <span>Couldn&apos;t load deals won.</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
      >
        Retry
      </button>
    </div>
  );
}
