'use client';

import { useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, Button, Skeleton, toast } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { WidgetHeader } from '@/components/dashboard/WidgetHeader';
import { ChartEmptyState } from '@/components/shared/ChartEmptyState';
import { CardList, CardListRow } from '@/components/dashboard/widgets/CardListSection';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { formatMoney, formatMoneyCompact } from '@/lib/format/money';
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';
import { buildRevenueProjection } from '@/lib/deals/forecast-projection';

const ForecastRevenueChart = dynamic(() => import('@/components/deals/ForecastRevenueChart'), {
  ssr: false,
  loading: () => (
    <Card className="p-6 h-96">
      <Skeleton className="h-full w-full" />
    </Card>
  ),
});

// Material Symbols icon helper component
const Icon = ({ name, className = '' }: Readonly<{ name: string; className?: string }>) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

// =============================================================================
// Types
// =============================================================================

type StageId = 'PROSPECTING' | 'QUALIFICATION' | 'NEEDS_ANALYSIS' | 'PROPOSAL' | 'NEGOTIATION';

interface ForecastDeal {
  id: string;
  name: string;
  stage: StageId;
  value: number;
  probability: number;
  expectedCloseDate: string;
  owner: {
    name: string;
    avatar: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

interface WinRateData {
  month: string;
  /** null: no deals closed that month. */
  rate: number | null;
  closed: number;
}

interface StageData {
  stage: StageId;
  label: string;
  value: number;
  count: number;
}

const OPEN_STAGES: StageId[] = [
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
];

// =============================================================================
// Constants & Sample Data
// =============================================================================

const STAGE_LABELS: Record<StageId, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
};

// NF-006: No hardcoded sample data arrays — all data from trpc.opportunity.forecast

// =============================================================================
// Utility Functions
// =============================================================================

/** Compact and full money in the tenant currency (Analytics -> Report settings). */
function useForecastMoney() {
  const currency = useTenantCurrency();
  return {
    currency,
    formatCurrency: (value: number) => formatMoneyCompact(value, currency),
    formatFullCurrency: (value: number) => formatMoney(value, currency),
  };
}

function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500';
  if (probability >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

// =============================================================================
// Components
// =============================================================================

/**
 * Owner 23/11: "This header and kpis aren't following our shared ones". The three KPIs are the
 * shared KpiCard; the "+12% / +5% vs last month" lines were fixed numbers in the code, so they are
 * gone rather than replaced with a guess.
 */
function ForecastKpis({
  accuracy,
  target,
  isAtRisk,
  hasHistory,
  pipelineValue,
  weightedValue,
  openDeals,
}: Readonly<{
  accuracy: number;
  target: number;
  isAtRisk: boolean;
  hasHistory: boolean;
  pipelineValue: number;
  weightedValue: number;
  openDeals: number;
}>) {
  const { formatFullCurrency } = useForecastMoney();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        framed
        label="Forecast accuracy"
        icon="gps_fixed"
        value={hasHistory ? `${accuracy}%` : 'No history yet'}
        badge={
          hasHistory ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isAtRisk ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
              }`}
            >
              {isAtRisk ? 'At risk' : 'On target'}
            </span>
          ) : undefined
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {hasHistory ? `Target: at least ${target}%` : 'Needs deals won in at least two months'}
          </p>
        }
      />
      <KpiCard
        framed
        label="Total pipeline value"
        icon="account_balance_wallet"
        value={formatFullCurrency(pipelineValue)}
        href="/deals"
        footer={
          <p className="text-xs text-muted-foreground">
            {openDeals.toLocaleString('en-GB')} open {openDeals === 1 ? 'deal' : 'deals'}
          </p>
        }
      />
      <KpiCard
        framed
        label="Weighted forecast"
        icon="query_stats"
        value={formatFullCurrency(weightedValue)}
        href="/deals"
        footer={
          <p className="text-xs text-muted-foreground">each deal&apos;s value × its probability</p>
        }
      />
    </div>
  );
}

function RevenueProjectionChart({
  data,
}: Readonly<{ data: ReturnType<typeof buildRevenueProjection> }>) {
  const { formatCurrency, formatFullCurrency } = useForecastMoney();
  return (
    <ForecastRevenueChart
      data={data}
      formatCurrency={formatCurrency}
      formatFullCurrency={formatFullCurrency}
    />
  );
}

/**
 * Win rate per month, last six months. A month with no closed deals shows no bar (owner 23/11:
 * it used to show the overall average as if it were that month's result).
 */
/**
 * The API's win-rate months, in either shape: today's ({ rate: number | null, closed }) or the one
 * before the fix deploys ({ rate, isProjected }), where a month with no closed deals carried the
 * overall rate and `isProjected: true`. Those months count as empty, never as history.
 */
function normaliseWinRate(
  data: ReadonlyArray<WinRateData & { isProjected?: boolean }>
): WinRateData[] {
  return data.map((d) => {
    if (typeof d.closed === 'number') return d;
    const real = d.isProjected === false && d.rate !== null;
    return { month: d.month, rate: real ? d.rate : null, closed: real ? 1 : 0 };
  });
}

function WinRateTrendCard({ data: raw }: Readonly<{ data: WinRateData[] }>) {
  const data = normaliseWinRate(raw);
  const closed = data.reduce((sum, d) => sum + d.closed, 0);
  const won = data.reduce((sum, d) => sum + ((d.rate ?? 0) * d.closed) / 100, 0);
  const average = closed > 0 ? Math.round((won / closed) * 100) : null;

  return (
    <Card className="border-border bg-card p-6">
      <WidgetHeader
        title="Win Rate Trend"
        className="mb-4"
        actions={
          average === null ? null : (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              Avg {average}%
            </span>
          )
        }
      />
      {closed === 0 ? (
        <ChartEmptyState
          message="No deals closed in the last six months"
          description="Each month's win rate shows here once deals are won or lost."
        />
      ) : (
        <>
          <div className="flex h-24 items-end gap-1">
            {data.map((item) => (
              <div key={item.month} className="flex h-full flex-1 items-end">
                {item.rate !== null && (
                  <div
                    className="w-full rounded-t bg-ds-primary"
                    style={{ height: `${Math.max(item.rate, 2)}%` }}
                    title={`${item.month}: ${item.rate}% of ${item.closed} closed`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            {data.map((item) => (
              <span key={item.month} className="flex-1 text-center">
                {item.month}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Every open stage, in pipeline order, empty ones included (owner 23/11). */
function PipelineByStageCard({ stages }: Readonly<{ stages: StageData[] }>) {
  const { formatCurrency } = useForecastMoney();
  const maxValue = Math.max(0, ...stages.map((s) => s.value));

  return (
    <Card className="border-border bg-card p-6">
      <WidgetHeader title="Pipeline by Stage" className="mb-4" />
      <div className="flex flex-col gap-3">
        {stages.map((stage) => (
          <div key={stage.stage} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-foreground">{stage.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatCurrency(stage.value)} ({stage.count} {stage.count === 1 ? 'deal' : 'deals'})
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ds-primary transition-all duration-500"
                style={{ width: maxValue > 0 ? `${(stage.value / maxValue) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OpportunitiesAtRiskTable({ deals }: Readonly<{ deals: ForecastDeal[] }>) {
  const { formatFullCurrency } = useForecastMoney();
  const { timezone } = useTimezoneContext();
  // Filter and sort by risk level and value
  const riskyDeals = deals
    .filter((d) => d.riskLevel === 'medium' || d.riskLevel === 'high' || d.probability < 60)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Top Opportunities at Risk
        </h3>
        <Link href="/deals" className="text-sm text-primary font-medium hover:underline">
          View All Deals
        </Link>
      </div>
      {/* Phones (owner 23/11, "not enhanced to mobile"): one tappable row per deal, the same
          card-list row the Dashboard uses; the six-column table only from sm up. */}
      <div className="px-4 pb-2 sm:hidden">
        <CardList label="Opportunities at risk">
          {riskyDeals.map((deal) => (
            <CardListRow
              key={deal.id}
              href={`/deals/${deal.id}`}
              primary={deal.name}
              secondary={`${STAGE_LABELS[deal.stage]} · ${formatFullCurrency(deal.value)}`}
              status={`${deal.probability}% probability · ${
                deal.expectedCloseDate
                  ? new Date(deal.expectedCloseDate).toLocaleDateString('en-GB', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: timezone,
                    })
                  : 'no close date'
              } · ${deal.owner.name}`}
              statusClassName={deal.probability < 50 ? 'text-destructive' : 'text-muted-foreground'}
            />
          ))}
        </CardList>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Deal Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Stage
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Value
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Probability
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Expected Close
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Owner
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {riskyDeals.map((deal) => (
              <tr
                key={deal.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => (globalThis.location.href = `/deals/${deal.id}`)}
              >
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{deal.name}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                    {STAGE_LABELS[deal.stage]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {formatFullCurrency(deal.value)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${getProbabilityColor(deal.probability)}`}
                        style={{ width: `${deal.probability}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{deal.probability}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {deal.expectedCloseDate
                      ? new Date(deal.expectedCloseDate).toLocaleDateString('en-GB', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: timezone,
                        })
                      : 'Not set'}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">
                      {deal.owner.avatar}
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {deal.owner.name}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// =============================================================================
// Loading Skeleton Component
// =============================================================================

function ForecastPageSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Header skeleton */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>

        {/* KPI Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </Card>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="p-6 h-96">
              <Skeleton className="h-6 w-40 mb-4" />
              <Skeleton className="h-64 w-full" />
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card className="p-6">
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-24 w-full" />
            </Card>
            <Card className="p-6">
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-32 w-full" />
            </Card>
          </div>
        </div>

        {/* Table skeleton */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b">
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// CSV Export Utility
// =============================================================================

function buildForecastCSV(
  deals: ForecastDeal[],
  totalPipelineValue: number,
  weightedForecast: number,
  quarterLabel: string,
  timezone: string = 'UTC'
): string {
  const lines: string[] = [];

  lines.push(
    `Aurora Forecast Report — ${quarterLabel}`,
    `Total Pipeline Value,${totalPipelineValue}`,
    `Weighted Forecast,${weightedForecast}`,
    '',
    'Deal Name,Stage,Value,Probability (%),Expected Close,Owner,Risk Level'
  );

  for (const deal of deals) {
    const closeDate = new Date(deal.expectedCloseDate).toLocaleDateString('en-GB', {
      timeZone: timezone,
    });
    const row = [
      `"${deal.name.replaceAll('"', '""')}"`,
      STAGE_LABELS[deal.stage] || deal.stage,
      deal.value,
      deal.probability,
      closeDate,
      `"${deal.owner.name.replaceAll('"', '""')}"`,
      deal.riskLevel,
    ].join(',');
    lines.push(row);
  }

  return lines.join('\n');
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DealForecastPage() {
  const tenantCurrency = useTenantCurrency();
  const { timezone } = useTimezoneContext();
  const router = useRouter();

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Fetch real forecast data from API
  const {
    data: forecastData,
    isLoading,
    error,
  } = trpc.opportunity.forecast.useQuery(undefined, { enabled: isAuthenticated && !authLoading });

  // Check for auth errors
  const isAuthError =
    error?.data?.code === 'UNAUTHORIZED' ||
    error?.message?.toLowerCase().includes('authentication') ||
    error?.message?.toLowerCase().includes('unauthorized');

  // Redirect to login for auth errors
  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Get current quarter label
  const currentQuarter = useMemo(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `Q${quarter} ${now.getFullYear()}`;
  }, []);

  // Derive data from API response or use defaults
  const forecastAccuracy = useMemo(() => {
    if (!forecastData) return { accuracy: 0, target: 85, isAtRisk: true };
    return {
      accuracy: Math.round(forecastData.forecastAccuracy.accuracy),
      target: forecastData.forecastAccuracy.target,
      isAtRisk: forecastData.forecastAccuracy.isAtRisk,
    };
  }, [forecastData]);

  const totalPipelineValue = forecastData?.totalPipelineValue ?? 0;
  const weightedForecast = Number(forecastData?.weightedValue) || 0;

  // Every open stage in pipeline order, empty ones included (owner 23/11: "Why all the other
  // stages aren't showing here?" - the API only lists stages that hold a deal).
  const stageBreakdown = useMemo<StageData[]>(() => {
    const byStage = new Map((forecastData?.stageBreakdown ?? []).map((s) => [s.stage, s]));
    return OPEN_STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      value: byStage.get(stage)?.totalValue ?? 0,
      count: byStage.get(stage)?.count ?? 0,
    }));
  }, [forecastData]);

  const deals = useMemo(() => {
    if (!forecastData?.deals) return [];
    return forecastData.deals as ForecastDeal[];
  }, [forecastData]);

  // Actual won revenue, then open deals weighted by probability in the month they should close.
  const monthlyProjections = useMemo(
    () => buildRevenueProjection(forecastData?.monthlyRevenue ?? [], deals),
    [forecastData, deals]
  );

  const winRateData = useMemo<WinRateData[]>(
    () => forecastData?.winRateTrend ?? [],
    [forecastData]
  );

  // Accuracy needs won revenue in two or more months; below that the API's 0% is "no data".
  const hasAccuracyHistory =
    (forecastData?.monthlyRevenue ?? []).filter((m) => (m.actual ?? 0) > 0).length >= 2;

  // Show loading state
  if (isLoading || authLoading) {
    return <ForecastPageSkeleton />;
  }

  // Show redirecting state for auth errors
  if (error && isAuthError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Icon name="progress_activity" className="text-6xl text-slate-400 mb-4 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Show error state for non-auth errors
  if (error && !isAuthError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Icon name="error" className="text-6xl text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Failed to load forecast data
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">{error.message}</p>
          <Button onClick={() => globalThis.location.reload()}>
            <Icon name="refresh" className="text-base mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const exportReport = () => {
    const csv = buildForecastCSV(
      deals,
      totalPipelineValue,
      weightedForecast,
      currentQuarter,
      timezone
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `forecast-${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `Forecast report for ${currentQuarter} downloaded.` });
  };

  const openDeals = forecastData?.totalOpportunities ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Owner 23/11: the shared page hero, with the page's own buttons kept. */}
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Deals', href: '/deals' },
          ]}
          title="Deal Forecast"
          description={`${currentQuarter} · ${openDeals.toLocaleString('en-GB')} open ${
            openDeals === 1 ? 'deal' : 'deals'
          }, in ${tenantCurrency}`}
          actions={[
            {
              label: 'This Quarter',
              icon: 'calendar_today',
              variant: 'secondary',
              hideOnMobile: true,
              onClick: () =>
                toast({
                  title: 'Quarter filter',
                  description:
                    'Date-range filtering across multiple quarters is tracked under IFC-048. The current view shows live data for the active quarter.',
                }),
            },
            {
              label: tenantCurrency,
              icon: 'payments',
              variant: 'secondary',
              hideOnMobile: true,
              onClick: () =>
                toast({
                  title: 'Currency',
                  description: `All values are shown in ${tenantCurrency}. Change the currency in Analytics > Report settings.`,
                }),
            },
            { label: 'Export', icon: 'download', variant: 'primary', onClick: exportReport },
          ]}
        />

        <ForecastKpis
          accuracy={forecastAccuracy.accuracy}
          target={forecastAccuracy.target}
          isAtRisk={forecastAccuracy.isAtRisk}
          hasHistory={hasAccuracyHistory}
          pipelineValue={totalPipelineValue}
          weightedValue={weightedForecast}
          openDeals={openDeals}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueProjectionChart data={monthlyProjections} />
          </div>
          <div className="flex flex-col gap-6">
            <WinRateTrendCard data={winRateData} />
            <PipelineByStageCard stages={stageBreakdown} />
          </div>
        </div>

        {deals.length > 0 && <OpportunitiesAtRiskTable deals={deals} />}
      </div>
    </div>
  );
}
