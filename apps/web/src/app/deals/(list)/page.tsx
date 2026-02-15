'use client';

/**
 * Deals Pipeline Page (PG-135 — Refactored)
 *
 * Orchestrates data fetching, auth, and layout.
 * Component rendering is delegated to @/components/deals/*.
 *
 * @module DealsPage
 */

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Skeleton } from '@intelliflow/ui';
import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';
import { PageHeader } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import {
  PipelineBoard,
  ValueSummary,
  DealFilters,
} from '@/components/deals';
import {
  type Deal,
  type DealFiltersValue,
  PIPELINE_STAGE_CONFIG,
  transformDeals,
  calculateStats,
  formatCurrencyCompact,
} from '@/components/deals/types';

// =============================================================================
// Loading Skeleton Components
// =============================================================================

const STATS_SKELETON_KEYS = ['stats-a', 'stats-b', 'stats-c', 'stats-d'] as const;
const COLUMN_SKELETON_KEYS = ['col-a', 'col-b', 'col-c', 'col-d', 'col-e', 'col-f'] as const;

function StatsCardSkeleton() {
  return (
    <Card className="p-3 sm:p-4 bg-card border-border">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-8 w-16" />
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="p-4 sm:p-6 bg-card border-border">
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-[250px] w-full" />
    </Card>
  );
}

function KanbanColumnSkeleton() {
  return (
    <div className="flex-1 min-w-[240px] sm:min-w-[280px] max-w-[300px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Skeleton className="w-3 h-3 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="bg-muted/50 rounded-lg p-2 h-[300px] sm:h-[500px] space-y-2">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

function DealsPageSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-1 mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {STATS_SKELETON_KEYS.map((key) => (
          <StatsCardSkeleton key={key} />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mb-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <Card className="p-3 sm:p-4 overflow-x-auto bg-card border-border">
        <div className="flex gap-3 sm:gap-4 min-w-max">
          {COLUMN_SKELETON_KEYS.map((key) => (
            <KanbanColumnSkeleton key={key} />
          ))}
        </div>
      </Card>
    </>
  );
}

// =============================================================================
// Error Display Component
// =============================================================================

interface ErrorDisplayProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

function ErrorDisplay({ message, onRetry }: Readonly<ErrorDisplayProps>) {
  return (
    <Card className="p-6 bg-destructive/10 border-destructive">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-destructive text-2xl">error</span>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Failed to load deals</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-all active:scale-95"
          >
            Retry
          </button>
        )}
      </div>
    </Card>
  );
}

// =============================================================================
// Main Deals Page Component
// =============================================================================

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filters, setFilters] = useState<DealFiltersValue>({});

  // Require authentication
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Fetch opportunities from API
  const {
    data: opportunitiesData,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.opportunity.list.useQuery(
    {
      limit: 100,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    { enabled: isAuthenticated && !authLoading },
  );

  // Auth error detection
  const isAuthError =
    error?.data?.code === 'UNAUTHORIZED' ||
    error?.message?.toLowerCase().includes('authentication') ||
    error?.message?.toLowerCase().includes('unauthorized');

  // Redirect on auth error
  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Transform API data → Deal[]
  useEffect(() => {
    if (opportunitiesData?.opportunities) {
      setDeals(transformDeals(opportunitiesData));
    }
  }, [opportunitiesData]);

  // Mutation for stage change
  const updateOpportunity = trpc.opportunity.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Handler: stage change from PipelineBoard (optimistic update + persist)
  const handleStageChange = useCallback(
    (dealId: string, newStage: OpportunityStage) => {
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)),
      );
      updateOpportunity.mutate({ id: dealId, stage: newStage });
    },
    [updateOpportunity],
  );

  const handleDealNavigate = useCallback(
    (dealId: string) => {
      router.push(`/deals/${dealId}`);
    },
    [router],
  );

  // Compute stats
  const pipelineStats = useMemo(() => calculateStats(deals), [deals]);

  // Deals grouped by stage for charts
  const dealsByStage = useMemo(() => {
    const grouped = Object.fromEntries(
      OPPORTUNITY_STAGES.map((s) => [s, [] as Deal[]]),
    ) as Record<OpportunityStage, Deal[]>;

    for (const deal of deals) {
      if (grouped[deal.stage]) grouped[deal.stage].push(deal);
    }
    return grouped;
  }, [deals]);

  // Chart data
  const pieChartData = useMemo(
    () =>
      OPPORTUNITY_STAGES.filter(
        (stage) => !['CLOSED_WON', 'CLOSED_LOST'].includes(stage),
      ).map((stage) => ({
        name: PIPELINE_STAGE_CONFIG[stage].label,
        value: dealsByStage[stage].length,
        color: PIPELINE_STAGE_CONFIG[stage].color,
      })),
    [dealsByStage],
  );

  const barChartData = useMemo(
    () =>
      OPPORTUNITY_STAGES.map((stage) => ({
        name: PIPELINE_STAGE_CONFIG[stage].label.replace(' ', '\n'),
        revenue: dealsByStage[stage].reduce((sum, deal) => sum + deal.value, 0),
        color: PIPELINE_STAGE_CONFIG[stage].color,
      })),
    [dealsByStage],
  );

  // Loading
  if (isLoading || authLoading) {
    return <DealsPageSkeleton />;
  }

  // Auth error redirect
  if (isError && isAuthError) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-slate-400 text-2xl animate-spin">
            progress_activity
          </span>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </Card>
    );
  }

  // Error
  if (isError && !isAuthError) {
    return (
      <ErrorDisplay
        message={error?.message ?? 'An unexpected error occurred'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Deals' },
        ]}
        title="Deals Pipeline"
        description="Manage your sales pipeline with drag-and-drop"
        actions={[
          {
            label: 'Forecast',
            icon: 'insights',
            variant: 'secondary',
            href: '/deals/all/forecast',
            hideOnMobile: true,
          },
          {
            label: 'New Deal',
            icon: 'add',
            variant: 'primary',
            href: '/deals/new',
          },
        ]}
      />

      {/* Filters (AC-9) */}
      <DealFilters value={filters} onChange={setFilters} />

      {/* Stats Cards (AC-7, AC-24) */}
      <ValueSummary stats={pipelineStats} />

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
        <Card className="p-4 sm:p-6 bg-card border-border">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Deals by Stage
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {pieChartData.map((entry) => (
                  <Cell key={`pie-${entry.name}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          {/* SR-only data table for chart accessibility (AC-23) */}
          <table className="sr-only" aria-label="Deals by Stage data">
            <thead>
              <tr><th>Stage</th><th>Count</th></tr>
            </thead>
            <tbody>
              {pieChartData.map((entry) => (
                <tr key={`pie-sr-${entry.name}`}>
                  <td>{entry.name}</td>
                  <td>{entry.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4 sm:p-6 bg-card border-border">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Revenue by Stage
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                width={50}
              />
              <Tooltip
                formatter={(value) => {
                  const numValue = typeof value === 'number' ? value : 0;
                  return [`$${numValue.toLocaleString()}`, 'Revenue'];
                }}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {barChartData.map((entry) => (
                  <Cell key={`bar-${entry.name}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* SR-only data table for chart accessibility (AC-23) */}
          <table className="sr-only" aria-label="Revenue by Stage data">
            <thead>
              <tr><th>Stage</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {barChartData.map((entry) => (
                <tr key={`bar-sr-${entry.name}`}>
                  <td>{entry.name}</td>
                  <td>{formatCurrencyCompact(entry.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Kanban Board (AC-1, AC-3, AC-4, AC-6, AC-19, AC-21) */}
      <Card className="p-3 sm:p-4 overflow-x-auto bg-card border-border -mx-4 sm:mx-0 rounded-none sm:rounded-lg mt-4">
        <PipelineBoard
          deals={deals}
          onStageChange={handleStageChange}
          onDealNavigate={handleDealNavigate}
        />
      </Card>
    </>
  );
}
