'use client';

/**
 * Analytics: Performance (owner 26/11, Analytics redesign and mockup). The Dashboard is the
 * operational workspace ("what needs attention today?"); Analytics is the business-intelligence
 * workspace ("how is the business performing, and why?"). It never repeats the Dashboard's
 * widgets (owner comment #10).
 *
 * Layout follows the mockup: hero with export, the views' tabs, the period and comparison, then
 * "Business performance": four KPIs with their definitions, booked revenue over time against the
 * previous period, and what changed with its evidence. Missing data says so; a failed request
 * says so; nothing shows a real-looking zero.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { HeroMenu, type HeroMenuItem } from '@/components/shared/hero-menu';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartEmptyState, ChartUnavailable } from '@/components/shared/ChartEmptyState';
import { MetricDefinition } from '@/components/shared/MetricDefinition';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import type { Comparison, MaterialChange } from '@/lib/analytics/period-comparison';
import {
  PERIOD_ITEMS,
  useCompactMoney,
  useReportExport,
  type ReportExportType,
} from './analytics-shared';
import { AnalyticsViewTabs, PeriodComparisonNote } from './AnalyticsWorkspace';
import { performanceChanges, usePerformanceMetrics, winRateOf } from './usePerformanceMetrics';

const PeriodComparisonChart = dynamic(
  () => import('./PeriodComparisonChart').then((m) => ({ default: m.PeriodComparisonChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-lg bg-muted" /> }
);

const EXPORT_ITEMS: HeroMenuItem[] = [
  { value: 'sales', label: 'Sales Metrics', icon: 'download' },
  { value: 'overview', label: 'Overview Metrics', icon: 'table_chart' },
  { value: 'leads', label: 'Lead Metrics', icon: 'group' },
];

const DEFINITIONS = {
  revenue:
    'Sum of the value of deals won, by the date they were won. Not cash collected or accounting revenue.',
  winRate: 'Deals won as a share of deals closed (won or lost) in the period.',
  cycle:
    'Average days from a deal being created to being won, for deals won in the period. A median will replace it once the stage history supports it.',
  pipeline:
    'Value of opportunities created in the period that are still open. Opportunities already won or lost are not included.',
};

export default function AnalyticsPerformancePage() {
  const money = useCompactMoney();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const range = useAnalyticsDateRange(period);
  const handleExport = useReportExport(range);
  const m = usePerformanceMetrics(range, period, isAuthenticated && !authLoading);
  const pending = authLoading || m.pending;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
        title="Analytics"
        description="Understand performance. Identify opportunities. Measure impact."
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
      >
        <PeriodComparisonNote range={range} />
      </PageHeader>

      <AnalyticsViewTabs active="performance" />

      <section aria-labelledby="business-performance" className="flex flex-col gap-4">
        <div>
          <h2 id="business-performance" className="text-lg font-semibold text-foreground">
            Business performance
          </h2>
          <p className="text-sm text-muted-foreground">
            Business outcomes and material changes across the selected period.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            framed
            label="Booked revenue"
            icon="payments"
            value={money(m.now?.totalRevenue ?? 0)}
            pending={pending}
            failed={m.failed}
            labelHint={<MetricDefinition label="Booked revenue" definition={DEFINITIONS.revenue} />}
            footer={<VsPrevious comparison={m.kpis.revenue} format={money} />}
          />
          <KpiCard
            framed
            label="Win rate"
            icon="emoji_events"
            value={
              winRateOf(m.now) == null
                ? 'No data'
                : `${Math.round((m.now?.winRate ?? 0) * 10) / 10}%`
            }
            pending={pending}
            failed={m.failed}
            labelHint={<MetricDefinition label="Win rate" definition={winRateDefinition(m.now)} />}
            footer={
              winRateOf(m.now) == null ? (
                <p className="text-xs text-muted-foreground">no deals closed in this period</p>
              ) : (
                <VsPrevious comparison={m.kpis.winRate} points />
              )
            }
          />
          <KpiCard
            framed
            label="Sales cycle"
            icon="timer"
            value={
              m.now?.avgSalesCycleDays == null
                ? 'No data'
                : `${Math.round(m.now.avgSalesCycleDays)} days`
            }
            pending={pending}
            failed={m.failed}
            labelHint={<MetricDefinition label="Sales cycle" definition={DEFINITIONS.cycle} />}
            footer={
              m.now?.avgSalesCycleDays == null ? (
                <p className="text-xs text-muted-foreground">no deals won in this period</p>
              ) : (
                <VsPrevious comparison={m.kpis.cycle} format={(v) => `${Math.round(v)} days`} />
              )
            }
          />
          <KpiCard
            framed
            label="Pipeline created"
            icon="add_chart"
            value={money(m.now?.pipelineValue ?? 0)}
            pending={pending}
            failed={m.failed}
            labelHint={
              <MetricDefinition label="Pipeline created" definition={DEFINITIONS.pipeline} />
            }
            footer={<VsPrevious comparison={m.kpis.pipeline} format={money} />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <Card className="border-border bg-card p-5">
            <PanelHeader title="Booked revenue over time" subtitle="Period comparison" />
            <RevenueComparison trend={m.trend} money={money} />
          </Card>
          <Card className="border-border bg-card p-5">
            <PanelHeader
              title="What changed"
              subtitle="Material changes, with the figures behind them"
            />
            <ChangesList
              pending={pending}
              failed={m.failed}
              changes={performanceChanges(m.kpis, money)}
            />
          </Card>
        </div>
      </section>
    </>
  );
}

function winRateDefinition(now: { closedWonCount: number; closedLostCount: number } | undefined) {
  if (!now) return DEFINITIONS.winRate;
  const closed = now.closedWonCount + now.closedLostCount;
  return `${DEFINITIONS.winRate} This period: ${now.closedWonCount} won of ${closed} closed.`;
}

function PanelHeader({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  return (
    <div className="mb-3">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function RevenueComparison({
  trend,
  money,
}: Readonly<{
  trend: ReturnType<typeof usePerformanceMetrics>['trend'];
  money: (v: number) => string;
}>) {
  if (trend.failed) {
    return <ChartUnavailable message="Couldn't load booked revenue." onRetry={trend.retry} />;
  }
  if (trend.pending) return <div className="h-[220px] animate-pulse rounded-lg bg-muted" />;
  if (trend.points.every((p) => !p.current && !p.previous)) {
    return (
      <ChartEmptyState
        message="No revenue booked in this period yet"
        description="Won deals show here by the date they were won."
      />
    );
  }
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-[#2a78f6]" aria-hidden="true" />
          <span>This period · {money(trend.totalNow ?? 0)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-[#a8b6cc]" aria-hidden="true" />
          <span>Previous period · {money(trend.totalBefore ?? 0)}</span>
        </span>
      </div>
      <PeriodComparisonChart data={trend.points} formatMoney={money} />
    </>
  );
}

/**
 * "+12% vs previous period" (or "+3 pp" for rates), coloured by whether the change is good for
 * the business; the previous figure when there is nothing to compare a percentage with.
 */
function VsPrevious({
  comparison,
  format = String,
  points = false,
}: Readonly<{ comparison: Comparison | null; format?: (v: number) => string; points?: boolean }>) {
  if (!comparison) return null;
  if (comparison.direction === 'flat') {
    return <p className="text-xs text-muted-foreground">same as the previous period</p>;
  }
  if (!points && comparison.percent === null) {
    return (
      <p className="text-xs text-muted-foreground">
        <span>{format(comparison.previous)}</span>
        <span> in the previous period</span>
      </p>
    );
  }
  const sign = comparison.delta > 0 ? '+' : '−';
  const amount = points
    ? `${Math.abs(Math.round(comparison.delta * 10) / 10)} pp`
    : `${Math.abs(Math.round(comparison.percent ?? 0))}%`;
  const toneClass = comparison.tone === 'good' ? 'text-success' : 'text-destructive';
  return (
    <p className="text-xs text-muted-foreground">
      <span className={`font-medium ${toneClass}`}>
        {sign}
        {amount}
      </span>
      <span> vs previous period</span>
    </p>
  );
}

function ChangesList({
  pending,
  failed,
  changes,
}: Readonly<{ pending: boolean; failed: boolean; changes: MaterialChange[] }>) {
  if (failed) {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t compare the periods.</p>;
  }
  if (pending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }
  if (changes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing moved by 10% (or 5 points) or more against the previous period.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {changes.map((c) => (
        <li key={c.label} className="flex gap-3 py-3 first:pt-0">
          <span
            className={`material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg text-[18px] ${
              c.tone === 'good' ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning'
            }`}
            aria-hidden="true"
          >
            {c.tone === 'good' ? 'trending_up' : 'priority_high'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{c.summary}</p>
            <p className="text-xs text-muted-foreground">{c.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
