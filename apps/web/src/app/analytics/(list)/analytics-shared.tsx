'use client';

/**
 * The pieces every Analytics report page shares (owner 22/11: Overview, Sales Reports and
 * Pipeline Analysis must look and count the same way): the period list for the hero's period
 * picker, money in the tenant currency, and the revenue trend card body.
 */

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { EmptyState } from '@intelliflow/ui';
import type { HeroMenuItem } from '@/components/shared/hero-menu';
import { formatMoneyCompact } from '@/lib/format/money';
import { downloadCSV } from '@/lib/export/csv';
import { trpc } from '@/lib/trpc';
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';

// Lazy-load the recharts-based RevenueTrendChart so its ~100KB minified dependency stays out of
// the page's main chunk (Lighthouse #84 script-bundle audit).
const RevenueTrendChart = dynamic(
  () => import('./RevenueTrendChart').then((m) => ({ default: m.RevenueTrendChart })),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
  }
);

export const PERIOD_ITEMS: HeroMenuItem[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
];

/** Compact money with one decimal, in the tenant currency. */
export function useCompactMoney(): (value: number) => string {
  const currency = useTenantCurrency();
  return (value) => formatMoneyCompact(value, currency, 1);
}

export interface TimeSeriesEntry {
  periodLabel: string;
  value: number;
}

export function RevenueTrendContent({
  loading,
  timeSeries,
}: Readonly<{ loading: boolean; timeSeries: TimeSeriesEntry[] | undefined | null }>) {
  const currency = useTenantCurrency();
  const formatCurrency = useCompactMoney();
  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  if (timeSeries && timeSeries.length > 0)
    return (
      <RevenueTrendChart
        timeSeries={timeSeries}
        formatCurrency={formatCurrency}
        currency={currency}
      />
    );
  return (
    <EmptyState entity="activity" showCta={false} description="No revenue data for this period" />
  );
}

/** A labelled share bar, for "leads by source" style breakdowns. */
export function ShareBar({
  label,
  count,
  percentage,
}: Readonly<{ label: string; count: number; percentage: number }>) {
  const width = Math.max(0, Math.min(100, percentage));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">
          {count.toLocaleString('en-GB')} ({Math.round(width)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-ds-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export type ReportExportType = 'overview' | 'funnel' | 'sales' | 'leads';

/** Downloads a server-built CSV of one report for the chosen period. */
export function useReportExport(dateRange: { startDate: string; endDate: string }) {
  const utils = trpc.useUtils();
  return useCallback(
    async (reportType: ReportExportType) => {
      try {
        const result = await utils.analytics.exportReport.fetch({
          format: 'csv',
          reportType,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
        if (result && typeof result.data === 'string') downloadCSV(result.data, result.filename);
      } catch {
        // The server export is unavailable: nothing to download.
      }
    },
    [dateRange, utils]
  );
}
