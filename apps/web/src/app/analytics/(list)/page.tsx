'use client';

import { useState } from 'react';

import { Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { WidgetHeader } from '@/components/dashboard/WidgetHeader';
import { RecentActivityWidget } from '@/components/dashboard/widgets/RecentActivityWidget';
import { PipelineSummaryWidget } from '@/components/dashboard/widgets/PipelineSummaryWidget';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import { HeroMenu, type HeroMenuItem } from '@/components/shared/hero-menu';
import {
  PERIOD_ITEMS,
  RevenueTrendContent,
  useCompactMoney,
  useReportExport,
  type ReportExportType,
} from './analytics-shared';

const EXPORT_ITEMS: HeroMenuItem[] = [
  { value: 'overview', label: 'Overview Metrics', icon: 'table_chart' },
  { value: 'funnel', label: 'Pipeline Funnel', icon: 'waterfall_chart' },
  { value: 'sales', label: 'Sales Metrics', icon: 'download' },
];

export default function AnalyticsPage() {
  const formatCurrency = useCompactMoney();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const dateRange = useAnalyticsDateRange(selectedPeriod);
  const enabled = isAuthenticated && !authLoading;

  // --- tRPC queries ---
  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewFailed,
  } = trpc.analytics.getOverview.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled }
  );

  const { data: funnel } = trpc.analytics.getConversionFunnel.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate, includeLeads: true },
    { enabled }
  );

  const { data: timeSeries, isLoading: timeSeriesLoading } =
    trpc.analytics.getTimeSeriesData.useQuery(
      {
        metric: 'revenue',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity: selectedPeriod === '7d' ? 'day' : 'month',
      },
      { enabled }
    );

  const { data: leadStats } = trpc.analytics.leadStats.useQuery(undefined, { enabled });

  const handleServerExport = useReportExport(dateRange);

  const isLoading = overviewLoading || authLoading;

  return (
    <>
      {/* Owner 21/11: the shared hero, like every other page. */}
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
        title="Analytics"
        description="AI-powered insights and sales pipeline analytics"
        controls={
          <>
            {/* Owner 22/11: the period picker looks like the hero's buttons (one shared control),
                and the Refresh button is gone: the data reloads when the period changes. */}
            <HeroMenu
              ariaLabel="Period"
              label="Period"
              icon="calendar_month"
              items={PERIOD_ITEMS}
              value={selectedPeriod}
              onSelect={(v) => setSelectedPeriod(v as PeriodKey)}
            />
            <HeroMenu
              label="Export"
              icon="download"
              variant="primary"
              heading="CSV export"
              items={EXPORT_ITEMS}
              onSelect={(v) => handleServerExport(v as ReportExportType)}
            />
          </>
        }
      />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          framed
          label="Total Leads"
          icon="group"
          value={(overview?.totalLeads ?? 0).toLocaleString('en-GB')}
          pending={isLoading}
          failed={overviewFailed && !overview}
          footer={
            <PeriodChange delta={overview?.leadDelta ?? 0} format={String}>
              {leadStats ? ` · ${leadStats.newThisMonth} new this month` : null}
            </PeriodChange>
          }
        />
        <KpiCard
          framed
          label="Revenue"
          icon="payments"
          value={formatCurrency(overview?.totalRevenue ?? 0)}
          pending={isLoading}
          failed={overviewFailed && !overview}
          footer={<PeriodChange delta={overview?.revenueDelta ?? 0} format={formatCurrency} />}
        />
        <KpiCard
          framed
          label="Open deals"
          icon="handshake"
          value={String(overview?.openOpportunities ?? 0)}
          pending={isLoading}
          failed={overviewFailed && !overview}
          footer={<PeriodChange delta={overview?.openOpportunitiesDelta ?? 0} format={String} />}
        />
        <KpiCard
          framed
          label="Win Rate"
          icon="emoji_events"
          value={`${overview?.winRate ?? 0}%`}
          pending={isLoading}
          failed={overviewFailed && !overview}
          footer={<PeriodChange delta={overview?.winRateDelta ?? 0} format={(v) => `${v} pp`} />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Owner 22/11: "This pipeline funnel data is different from the data we have on dashboard".
            It was deals created in the period, with Closed Won and deleted deals counted; now it is
            the Dashboard's own Pipeline Summary (open deals, the tenant's stages, lead counts). */}
        <Card className="lg:col-span-2 overflow-hidden p-0 bg-card border-border">
          <PipelineSummaryWidget />
        </Card>

        {/* Lead Stats + Quick Info */}
        <Card className="p-6 bg-card border-border">
          <WidgetHeader title="Lead Overview" className="mb-6" />
          {overview ? (
            <div className="space-y-4">
              <QuickStat
                label="New Contacts"
                value={overview.newContacts}
                delta={overview.newContactsDelta}
              />
              <QuickStat
                label="Win Rate"
                value={`${overview.winRate}%`}
                delta={overview.winRateDelta}
                suffix="pp"
              />
              {leadStats && (
                <>
                  <QuickStat label="Total Leads (all time)" value={leadStats.total} />
                  <QuickStat label="New This Month" value={leadStats.newThisMonth} />
                </>
              )}
              {funnel && <QuickStat label="Total Leads (period)" value={funnel.totalLeads} />}
            </div>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-10 bg-muted rounded" />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend Chart */}
        <Card className="p-6 bg-card border-border">
          <WidgetHeader title="Revenue Trend" className="mb-6" />
          <RevenueTrendContent loading={timeSeriesLoading} timeSeries={timeSeries} />
        </Card>

        {/* Recent Activity: the Dashboard's own card (owner 21/11: unify Analytics with the
            Dashboard), not a second feed that read "New item: Unknown". */}
        <Card className="overflow-hidden p-0 bg-card border-border">
          <RecentActivityWidget />
        </Card>
      </div>
    </>
  );
}

// --- Helpers ---

function PeriodChange({
  delta,
  format,
  children,
}: Readonly<{ delta: number; format: (v: number) => string; children?: React.ReactNode }>) {
  const up = delta >= 0;
  return (
    <p className="text-xs text-muted-foreground">
      <span className={`font-medium ${up ? 'text-success' : 'text-destructive'}`}>
        {up ? '+' : '-'}
        {format(Math.abs(delta))}
      </span>{' '}
      vs previous period{children}
    </p>
  );
}

function QuickStat({
  label,
  value,
  delta,
  suffix,
}: Readonly<{
  label: string;
  value: string | number;
  delta?: number;
  suffix?: string;
}>) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{value}</span>
        {delta !== undefined && (
          <span
            className={`text-xs font-medium ${delta >= 0 ? 'text-success' : 'text-destructive'}`}
          >
            {delta >= 0 ? '+' : ''}
            {delta}
            {suffix ? ` ${suffix}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
