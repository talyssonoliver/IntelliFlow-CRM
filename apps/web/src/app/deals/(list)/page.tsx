'use client';

/**
 * Deals Page (PG-135 + Deal List View)
 *
 * Supports two views controlled by ?view= query param:
 * - Pipeline (kanban board with DnD) — ?view=pipeline
 * - List (DataTable with search/filters) — default (no param)
 *
 * @module DealsPage
 */

import * as React from 'react';
import { Suspense, useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, Skeleton, toast } from '@intelliflow/ui';
import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';
import { PageHeader } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useDealFilterOptions } from '@/hooks/use-dynamic-filters';
import { revalidateDealCaches } from '@/app/deals/actions';

import {
  PipelineBoard,
  ValueSummary,
  DealFilters,
  DealListView,
  LossReasonModal,
} from '@/components/deals';

const DealsCharts = dynamic(() => import('@/components/deals/DealsCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
      <Card className="p-4 sm:p-6 bg-card border-border">
        <Skeleton className="h-62.5 w-full" />
      </Card>
      <Card className="p-4 sm:p-6 bg-card border-border">
        <Skeleton className="h-62.5 w-full" />
      </Card>
    </div>
  ),
});
import {
  type Deal,
  type DealFiltersValue,
  PIPELINE_STAGE_CONFIG,
  STAGE_PROBABILITIES,
  transformDeals,
  calculateStats,
  buildOpportunityListInput,
} from '@/components/deals/types';

// =============================================================================
// View Mode
// =============================================================================

type ViewMode = 'kanban' | 'list';

function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');

  const viewMode: ViewMode = viewParam === 'pipeline' ? 'kanban' : 'list';

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === 'kanban') {
        router.push('/deals?view=pipeline');
      } else {
        router.push('/deals');
      }
    },
    [router]
  );

  return [viewMode, setViewMode];
}

// =============================================================================
// Loading Skeleton Components
// =============================================================================

const STATS_SKELETON_KEYS = ['stats-a', 'stats-b', 'stats-c', 'stats-d'] as const;
const COLUMN_SKELETON_KEYS = ['col-a', 'col-b', 'col-c', 'col-d', 'col-e', 'col-f'] as const;
const LIST_SKELETON_KEYS = ['list-a', 'list-b', 'list-c', 'list-d', 'list-e'] as const;

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
      <Skeleton className="h-62.5 w-full" />
    </Card>
  );
}

function KanbanColumnSkeleton() {
  return (
    <div className="flex-1 min-w-60 sm:min-w-70 max-w-75">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Skeleton className="w-3 h-3 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="bg-muted/50 rounded-lg p-2 h-75 sm:h-125 space-y-2">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

function PipelineSkeleton() {
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

function ListSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-1 mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full mb-4" />
      <div className="space-y-3">
        {LIST_SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border"
          >
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
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
  return (
    <Suspense fallback={<PipelineSkeleton />}>
      <DealsPageContent />
    </Suspense>
  );
}

function DealsPageContent() {
  const router = useRouter();
  const [viewMode, setViewMode] = useViewMode();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filters, setFilters] = useState<DealFiltersValue>({});

  // Require authentication
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();

  // Real tenant owners for the owner filter (IFC-287 F-12)
  const { ownerOptions } = useDealFilterOptions();

  // Translate the filter bar state into list query params (IFC-287 F-10)
  const queryInput = useMemo(
    () => ({
      limit: 100,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      ...buildOpportunityListInput(filters),
    }),
    [filters]
  );

  // Fetch opportunities from API (only for pipeline view — list view fetches its own data)
  const {
    data: opportunitiesData,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.opportunity.list.useQuery(queryInput, {
    enabled: isAuthenticated && !authLoading && viewMode === 'kanban',
  });

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

  // State for pending deal and loss reason modal (IFC-064)
  const [pendingDealId, setPendingDealId] = useState<string | null>(null);
  const [lossReasonState, setLossReasonState] = useState<{
    dealId: string;
    dealName: string;
  } | null>(null);

  // Mutation for stage change (IFC-064: uses moveStage endpoint)
  const moveStage = trpc.opportunity.moveStage.useMutation({
    onSuccess: () => {
      revalidateDealCaches(user?.id ?? null).catch(() => {});
      setPendingDealId(null);
      refetch();
      toast({ title: 'Deal stage updated successfully' });
    },
    onError: (err, _variables, context) => {
      // Rollback to previous state (AC-004)
      const previousDeals = (context as { previousDeals?: Deal[] })?.previousDeals;
      if (previousDeals) {
        setDeals(previousDeals);
      }
      setPendingDealId(null);

      const message =
        err.message === 'OpportunityAlreadyClosedError'
          ? 'This deal has already been closed by another user'
          : 'Failed to update deal stage. Please try again.';
      toast({ title: message, variant: 'destructive' });
    },
    onMutate: async ({
      id,
      targetStage,
    }: Readonly<{ id: string; targetStage: string; reason?: string }>) => {
      const previousDeals = [...deals];
      // Optimistic update (AC-002)
      setPendingDealId(id);
      setDeals((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                stage: targetStage as OpportunityStage,
                probability: STAGE_PROBABILITIES[targetStage as OpportunityStage] ?? d.probability,
              }
            : d
        )
      );
      return { previousDeals };
    },
  });

  // Handler: stage change from PipelineBoard (IFC-064)
  const handleStageChange = useCallback(
    (dealId: string, newStage: OpportunityStage) => {
      if (newStage === 'CLOSED_LOST') {
        // Open loss reason modal (AC-005)
        const deal = deals.find((d) => d.id === dealId);
        setLossReasonState({
          dealId,
          dealName: deal?.name ?? 'Unknown Deal',
        });
        return;
      }

      const startTime = performance.now();
      moveStage.mutate(
        { id: dealId, targetStage: newStage },
        {
          onSettled: () => {
            const elapsed = performance.now() - startTime;
            if (elapsed > 300) {
              console.warn(`[IFC-064] Stage change took ${elapsed.toFixed(0)}ms (target: <300ms)`);
            }
          },
        }
      );
    },
    [deals, moveStage]
  );

  // Handler: loss reason confirmed (IFC-064 AC-005)
  const handleLossReasonConfirm = useCallback(
    (reason: string) => {
      if (!lossReasonState) return;
      moveStage.mutate({
        id: lossReasonState.dealId,
        targetStage: 'CLOSED_LOST',
        reason,
      });
      setLossReasonState(null);
    },
    [lossReasonState, moveStage]
  );

  // Handler: loss reason cancelled
  const handleLossReasonCancel = useCallback(() => {
    setLossReasonState(null);
  }, []);

  const handleDealNavigate = useCallback(
    (dealId: string) => {
      router.push(`/deals/${dealId}`);
    },
    [router]
  );

  // Compute stats
  const pipelineStats = useMemo(() => calculateStats(deals), [deals]);

  // Deals grouped by stage for charts
  const dealsByStage = useMemo(() => {
    const grouped = Object.fromEntries(OPPORTUNITY_STAGES.map((s) => [s, [] as Deal[]])) as Record<
      OpportunityStage,
      Deal[]
    >;

    for (const deal of deals) {
      if (grouped[deal.stage]) grouped[deal.stage].push(deal);
    }
    return grouped;
  }, [deals]);

  // Chart data
  const pieChartData = useMemo(
    () =>
      OPPORTUNITY_STAGES.filter((stage) => !['CLOSED_WON', 'CLOSED_LOST'].includes(stage)).map(
        (stage) => ({
          name: PIPELINE_STAGE_CONFIG[stage].label,
          value: dealsByStage[stage].length,
          color: PIPELINE_STAGE_CONFIG[stage].color,
        })
      ),
    [dealsByStage]
  );

  const barChartData = useMemo(
    () =>
      OPPORTUNITY_STAGES.map((stage) => ({
        name: PIPELINE_STAGE_CONFIG[stage].label.replaceAll(' ', '\n'),
        revenue: dealsByStage[stage].reduce((sum, deal) => sum + deal.value, 0),
        color: PIPELINE_STAGE_CONFIG[stage].color,
      })),
    [dealsByStage]
  );

  // Header config adapts to view mode
  const headerTitle = viewMode === 'kanban' ? 'Deals Pipeline' : 'Deal List';
  const headerDescription =
    viewMode === 'kanban'
      ? 'Manage your sales pipeline with drag-and-drop'
      : 'Browse and manage all your deals';

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (authLoading || (isLoading && viewMode === 'kanban')) {
    return viewMode === 'kanban' ? <PipelineSkeleton /> : <ListSkeleton />;
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

  // Error (pipeline view only — list handles its own errors)
  if (isError && !isAuthError && viewMode === 'kanban') {
    return (
      <ErrorDisplay
        message={error?.message ?? 'An unexpected error occurred'}
        onRetry={() => refetch()}
      />
    );
  }

  // ─── List View ─────────────────────────────────────────────────────────────

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Deals' }]}
          title={headerTitle}
          description={headerDescription}
          actions={[
            {
              label: 'Pipeline',
              icon: 'view_kanban',
              variant: 'secondary',
              onClick: () => setViewMode('kanban'),
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

        <DealListView />
      </div>
    );
  }

  // ─── Pipeline View ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Deals' }]}
        title={headerTitle}
        description={headerDescription}
        actions={[
          {
            label: 'List',
            icon: 'view_list',
            variant: 'secondary',
            onClick: () => setViewMode('list'),
            hideOnMobile: true,
          },
          {
            label: 'Forecast',
            icon: 'insights',
            variant: 'secondary',
            href: '/deals/forecast',
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
      <DealFilters
        value={filters}
        onChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        owners={ownerOptions}
      />

      {/* Stats Cards (AC-7, AC-24) */}
      <ValueSummary stats={pipelineStats} />

      {/* Charts Section (lazy-loaded) */}
      <DealsCharts pieChartData={pieChartData} barChartData={barChartData} />

      {/* Kanban Board (AC-1, AC-3, AC-4, AC-6, AC-19, AC-21) */}
      <Card className="p-3 sm:p-4 overflow-x-auto bg-card border-border -mx-4 sm:mx-0 rounded-none sm:rounded-lg mt-4">
        <PipelineBoard
          deals={deals}
          onStageChange={handleStageChange}
          onDealNavigate={handleDealNavigate}
          pendingDealId={pendingDealId}
        />
      </Card>

      {/* Loss Reason Modal (IFC-064 AC-005) */}
      <LossReasonModal
        open={lossReasonState !== null}
        onConfirm={handleLossReasonConfirm}
        onCancel={handleLossReasonCancel}
        dealName={lossReasonState?.dealName ?? ''}
      />
    </>
  );
}
