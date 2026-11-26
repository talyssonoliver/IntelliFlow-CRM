'use client';

/**
 * Sales Reports (owner 22/11: "This page sales reports and pipeline analysis is no ops yet, why?").
 * The nav link used to open the Overview again (`/analytics?view=sales`, a parameter no page read).
 * This is the real report: what was won and lost in the period, from `analytics.getSalesMetrics`,
 * with the same hero, period picker, KPI card and revenue trend as the Overview.
 */

import { useState } from 'react';
import { Card } from '@intelliflow/ui';
import { ChartUnavailable } from '@/components/shared/ChartEmptyState';
import { PageHeader } from '@/components/shared/page-header';
import { HeroMenu, type HeroMenuItem } from '@/components/shared/hero-menu';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { WidgetHeader } from '@/components/dashboard/WidgetHeader';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import {
  PERIOD_ITEMS,
  RevenueTrendContent,
  ShareBar,
  useCompactMoney,
  useReportExport,
  type ReportExportType,
} from '../analytics-shared';

const EXPORT_ITEMS: HeroMenuItem[] = [
  { value: 'sales', label: 'Sales Metrics', icon: 'download' },
  { value: 'overview', label: 'Overview Metrics', icon: 'table_chart' },
];

export default function SalesReportsPage() {
  const formatMoney = useCompactMoney();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const dateRange = useAnalyticsDateRange(period);
  const enabled = isAuthenticated && !authLoading;
  const handleExport = useReportExport(dateRange);

  const sales = trpc.analytics.getSalesMetrics.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled }
  );
  const trend = trpc.analytics.getTimeSeriesData.useQuery(
    {
      metric: 'revenue',
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      granularity: period === '7d' ? 'day' : 'month',
    },
    { enabled }
  );

  const pending = authLoading || sales.isLoading;
  const failed = sales.isError && !sales.data;
  const m = sales.data;
  const closed = (m?.closedWonCount ?? 0) + (m?.closedLostCount ?? 0);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Analytics', href: '/analytics' },
        ]}
        title="Sales Reports"
        description="Deals won and lost, and the revenue they brought in"
        controls={
          <>
            <HeroMenu
              ariaLabel="Period"
              label="Period"
              icon="calendar_month"
              items={PERIOD_ITEMS}
              value={period}
              onSelect={(v) => setPeriod(v as PeriodKey)}
            />
            <HeroMenu
              label="Export"
              icon="download"
              variant="primary"
              heading="CSV export"
              items={EXPORT_ITEMS}
              onSelect={(v) => handleExport(v as ReportExportType)}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          framed
          label="Revenue won"
          icon="payments"
          value={formatMoney(m?.totalRevenue ?? 0)}
          pending={pending}
          failed={failed}
          href="/deals"
        />
        <KpiCard
          framed
          label="Win rate"
          icon="emoji_events"
          value={`${m?.winRate ?? 0}%`}
          pending={pending}
          failed={failed}
          href="/deals"
          footer={
            <p className="text-xs text-muted-foreground">
              of {closed.toLocaleString('en-GB')} closed {closed === 1 ? 'deal' : 'deals'}
            </p>
          }
        />
        <KpiCard
          framed
          label="Average deal"
          icon="sell"
          value={formatMoney(m?.avgDealSize ?? 0)}
          pending={pending}
          failed={failed}
          href="/deals"
        />
        <KpiCard
          framed
          label="Sales cycle"
          icon="timer"
          value={m?.avgSalesCycleDays == null ? 'None' : `${Math.round(m.avgSalesCycleDays)} days`}
          pending={pending}
          failed={failed}
          href="/deals"
          footer={
            <p className="text-xs text-muted-foreground">
              {m?.avgSalesCycleDays == null
                ? 'no deals won in this period'
                : 'average, created to won'}
            </p>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card p-6 lg:col-span-2">
          <WidgetHeader title="Revenue Trend" className="mb-6" />
          <RevenueTrendContent loading={trend.isLoading} timeSeries={trend.data} />
        </Card>

        <Card className="border-border bg-card p-6">
          <WidgetHeader title="Won and lost" className="mb-6" />
          <WonLostBody
            failed={failed}
            pending={pending}
            won={m?.closedWonCount ?? 0}
            lost={m?.closedLostCount ?? 0}
            onRetry={() => void sales.refetch()}
          />
        </Card>
      </div>
    </>
  );
}

/** The won-and-lost card body: a retry when the request failed, never zeros (codex 26/11). */
function WonLostBody({
  failed,
  pending,
  won,
  lost,
  onRetry,
}: Readonly<{
  failed: boolean;
  pending: boolean;
  won: number;
  lost: number;
  onRetry: () => void;
}>) {
  if (failed) {
    return <ChartUnavailable message="Couldn't load won and lost deals." onRetry={onRetry} />;
  }
  if (pending) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }
  const closed = won + lost;
  return (
    <div className="space-y-4">
      <ShareBar label="Won" count={won} percentage={closed ? (won / closed) * 100 : 0} />
      <ShareBar label="Lost" count={lost} percentage={closed ? (lost / closed) * 100 : 0} />
      {closed === 0 && (
        <p className="text-sm text-muted-foreground">No deals closed in this period.</p>
      )}
    </div>
  );
}
