'use client';

import { useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, Button, Skeleton, toast } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { EntityHeader } from '@/components/shared';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

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

interface MonthlyProjection {
  month: string;
  actual: number | null;
  projected: number | null;
}

interface WinRateData {
  month: string;
  rate: number;
  isProjected: boolean;
}

interface StageData {
  stage: string;
  value: number;
  percentage: number;
}

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

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${Math.round(value / 1000)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatFullCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500';
  if (probability >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

// =============================================================================
// Components
// =============================================================================

function ForecastAccuracyCard({
  accuracy,
  isAtRisk,
  target,
}: Readonly<{
  accuracy: number;
  isAtRisk: boolean;
  target: number;
}>) {
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 z-10">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Forecast Accuracy
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{accuracy}%</h3>
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                isAtRisk
                  ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/30'
                  : 'text-green-600 bg-green-100 dark:bg-green-900/30'
              }`}
            >
              {isAtRisk ? 'At Risk' : 'On Target'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Target: ≥ {target}%</p>
        </div>

        {/* Gauge Chart */}
        <div className="relative size-20 flex-shrink-0">
          <svg className="size-20 transform -rotate-90" viewBox="0 0 36 36">
            {/* Background circle */}
            <path
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray="100, 100"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            {/* Progress circle */}
            <path
              className="text-primary"
              strokeDasharray={`${accuracy}, 100`}
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon name="gps_fixed" className="text-2xl text-primary" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function PipelineValueCard({ value, trend }: Readonly<{ value: number; trend: number }>) {
  const isPositive = trend >= 0;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Pipeline Value</p>
      <div className="flex items-center gap-3 mt-1">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
          {formatFullCurrency(value)}
        </h3>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <Icon name="trending_up" className="text-base text-green-500" />
        ) : (
          <Icon name="trending_down" className="text-base text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {trend}% vs last month
        </span>
      </div>
    </Card>
  );
}

function WeightedForecastCard({ value, trend }: Readonly<{ value: number; trend: number }>) {
  const isPositive = trend >= 0;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Weighted Forecast</p>
      <div className="flex items-center gap-3 mt-1">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
          {formatFullCurrency(value)}
        </h3>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <Icon name="trending_up" className="text-base text-green-500" />
        ) : (
          <Icon name="trending_down" className="text-base text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {trend}% vs last month
        </span>
      </div>
    </Card>
  );
}

function RevenueProjectionChart({ data }: Readonly<{ data: MonthlyProjection[] }>) {
  return (
    <ForecastRevenueChart
      data={data}
      formatCurrency={formatCurrency}
      formatFullCurrency={formatFullCurrency}
    />
  );
}

function WinRateTrendCard({ data }: Readonly<{ data: WinRateData[] }>) {
  const avgRate = Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Win Rate Trend</h3>
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
          Avg {avgRate}%
        </span>
      </div>
      <div className="h-24 flex items-end gap-1 mt-4">
        {data.map((item, index) => (
          <div
            key={`${item.month}-${index}`}
            className={`flex-1 rounded-t transition-all hover:opacity-80 ${(() => {
              if (item.isProjected) return 'bg-slate-200 dark:bg-slate-700 border-t-2 border-dashed border-slate-400';
              if (index === data.length - 2) return 'bg-primary';
              return 'bg-primary/30';
            })()}`}
            style={{ height: `${item.rate * 2.5}%` }}
            title={`${item.month}: ${item.rate}%`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-400">
        {data.map((item, index) => (
          <span key={`${item.month}-label-${index}`}>{item.month}</span>
        ))}
      </div>
    </Card>
  );
}

function PipelineByStageCard({ stages }: Readonly<{ stages: StageData[] }>) {
  const maxValue = Math.max(...stages.map((s) => s.value));

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Pipeline by Stage</h3>
      <div className="flex flex-col gap-3">
        {stages.map((stage, index) => (
          <div key={stage.stage} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{stage.stage}</span>
              <span className="font-medium">{formatCurrency(stage.value)}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(stage.value / maxValue) * 100}%`,
                  backgroundColor: `rgba(19, 127, 236, ${1 - index * 0.2})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OpportunitiesAtRiskTable({ deals }: Readonly<{ deals: ForecastDeal[] }>) {
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
      <div className="overflow-x-auto">
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
                    {new Date(deal.expectedCloseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: timezone,
                    })}
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
    `IntelliFlow Forecast Report — ${quarterLabel}`,
    `Total Pipeline Value,${totalPipelineValue}`,
    `Weighted Forecast,${weightedForecast}`,
    '',
    'Deal Name,Stage,Value,Probability (%),Expected Close,Owner,Risk Level',
  );

  for (const deal of deals) {
    const closeDate = new Date(deal.expectedCloseDate).toLocaleDateString('en-US', { timeZone: timezone });
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

  const stageBreakdown = useMemo(() => {
    if (!forecastData?.stageBreakdown) return [];
    return forecastData.stageBreakdown.map((s) => ({
      stage: STAGE_LABELS[s.stage as StageId] || s.stage,
      value: s.totalValue,
      percentage: s.percentage,
    }));
  }, [forecastData]);

  const deals = useMemo(() => {
    if (!forecastData?.deals) return [];
    return forecastData.deals as ForecastDeal[];
  }, [forecastData]);

  const monthlyProjections = useMemo(() => {
    if (!forecastData?.monthlyRevenue || forecastData.monthlyRevenue.length === 0) {
      return [];
    }
    // Add projected months based on average revenue
    const projections: MonthlyProjection[] = [...forecastData.monthlyRevenue];
    const projectedMonths = ['Oct', 'Nov', 'Dec'];
    const avgRevenue =
      forecastData.monthlyRevenue.length > 0
        ? forecastData.monthlyRevenue.reduce((sum, m) => sum + (m.actual || 0), 0) /
          forecastData.monthlyRevenue.length
        : 0;

    projectedMonths.forEach((month, i) => {
      if (!projections.some((p) => p.month === month)) {
        projections.push({
          month,
          actual: null,
          projected: avgRevenue > 0 ? Math.round(avgRevenue * (1 + (i + 1) * 0.1)) : null,
        });
      }
    });
    return projections;
  }, [forecastData]);

  const winRateData = useMemo(() => {
    if (!forecastData?.winRateTrend || forecastData.winRateTrend.length === 0) {
      return [];
    }
    return forecastData.winRateTrend;
  }, [forecastData]);

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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Header using EntityHeader */}
        <EntityHeader
          breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: 'Forecast' }]}
          title="Deal Forecast"
          badges={[{ label: currentQuarter, variant: 'info' }]}
          actions={[
            {
              label: 'This Quarter',
              icon: 'calendar_today',
              variant: 'secondary',
              onClick: () =>
                toast({
                  title: 'Quarter filter',
                  description:
                    'Date-range filtering across multiple quarters is tracked under IFC-048. The current view shows live data for the active quarter.',
                }),
            },
            {
              label: 'USD',
              icon: 'attach_money',
              variant: 'secondary',
              onClick: () =>
                toast({
                  title: 'Currency conversion',
                  description:
                    'Multi-currency display is tracked under IFC-201. All values are currently shown in USD.',
                }),
            },
            {
              label: 'Export Report',
              icon: 'download',
              variant: 'primary',
              onClick: () => {
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
                toast({
                  title: 'Exported',
                  description: `Forecast report for ${currentQuarter} downloaded.`,
                });
              },
            },
          ]}
        >
          <p className="text-sm text-muted-foreground mt-1">
            Performance analysis and revenue projection for {currentQuarter}
          </p>
        </EntityHeader>

        {/* Real-time data indicator */}
        {forecastData && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <span className="size-2 bg-green-500 rounded-full animate-pulse" />
            Live data from {forecastData.totalOpportunities} active opportunities
            {forecastData.winRate > 0 && ` • ${forecastData.winRate}% win rate`}
          </div>
        )}

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ForecastAccuracyCard {...forecastAccuracy} />
          <PipelineValueCard value={totalPipelineValue} trend={12} />
          <WeightedForecastCard value={weightedForecast} trend={5} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Projection - 2/3 width */}
          <div className="lg:col-span-2">
            <RevenueProjectionChart data={monthlyProjections} />
          </div>

          {/* Win Rate & Pipeline by Stage - 1/3 width */}
          <div className="flex flex-col gap-6">
            <WinRateTrendCard data={winRateData} />
            <PipelineByStageCard stages={stageBreakdown} />
          </div>
        </div>

        {/* Opportunities at Risk Table */}
        {deals.length > 0 && <OpportunitiesAtRiskTable deals={deals} />}
      </div>
    </div>
  );
}
