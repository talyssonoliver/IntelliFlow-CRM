'use client';

/**
 * Deals Pipeline Page
 *
 * Displays a kanban-style board for managing sales opportunities.
 * Features:
 * - Drag-and-drop stage transitions
 * - Real-time stats and charts
 * - Responsive design with mobile support
 * - Accessibility: keyboard navigation, ARIA labels
 *
 * @module DealsPage
 */

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, cn, Skeleton } from '@intelliflow/ui';
import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';
import { PageHeader } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

// =============================================================================
// Utility Functions
// =============================================================================

/** Format currency with full value (e.g., $125,000) */
function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format currency in compact form (e.g., $125K, $1.2M) */
function formatCurrencyCompact(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
}

/**
 * Pipeline stage configuration derived from domain constants.
 * Colors match the design system tokens from globals.css.
 */
const PIPELINE_STAGE_CONFIG: Record<OpportunityStage, { label: string; color: string }> = {
  PROSPECTING: { label: 'Prospecting', color: 'hsl(var(--muted-foreground))' },
  QUALIFICATION: { label: 'Qualification', color: 'hsl(var(--stage-qualification))' },
  NEEDS_ANALYSIS: { label: 'Needs Analysis', color: 'hsl(var(--stage-proposal))' },
  PROPOSAL: { label: 'Proposal', color: 'hsl(var(--chart-3))' },
  NEGOTIATION: { label: 'Negotiation', color: 'hsl(var(--stage-negotiation))' },
  CLOSED_WON: { label: 'Closed Won', color: 'hsl(var(--stage-won))' },
  CLOSED_LOST: { label: 'Closed Lost', color: 'hsl(var(--stage-lost))' },
};

// Use domain stages as the single source of truth
type StageId = OpportunityStage;

/** Deal interface matching API response */
interface Deal {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly stage: StageId;
  readonly probability: number;
  readonly expectedCloseDate: string | null;
  readonly accountName: string;
  readonly contactName: string | null;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly createdAt: string;
}

// =============================================================================
// Loading Skeleton Components
// =============================================================================

/** Skeleton key constants to avoid array index usage */
const STATS_SKELETON_KEYS = ['stats-a', 'stats-b', 'stats-c', 'stats-d'] as const;
const COLUMN_SKELETON_KEYS = ['col-a', 'col-b', 'col-c', 'col-d', 'col-e', 'col-f'] as const;

/** Loading skeleton for stats cards */
function StatsCardSkeleton() {
  return (
    <Card className="p-3 sm:p-4 bg-card border-border">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-8 w-16" />
    </Card>
  );
}

/** Loading skeleton for chart */
function ChartSkeleton() {
  return (
    <Card className="p-4 sm:p-6 bg-card border-border">
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-[250px] w-full" />
    </Card>
  );
}

/** Loading skeleton for kanban column */
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

/** Full page loading skeleton */
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

/** Error display component with retry button */
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
// Sortable Deal Card Component
// =============================================================================

function SortableDealCard({ deal, onNavigate }: Readonly<{ deal: Deal; onNavigate: () => void }>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: {
      type: 'deal',
      deal,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      className={cn(
        'bg-card rounded-lg border border-border text-left w-full',
        'p-3 sm:p-4 cursor-pointer transition-all duration-200 touch-pan-y',
        'hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
      onClick={onNavigate}
      onKeyDown={handleKeyDown}
      aria-label={`View deal: ${deal.name}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <h4 className="font-medium text-foreground text-xs sm:text-sm line-clamp-2">
          {deal.name}
        </h4>
        <button
          type="button"
          aria-label="Drag to move deal"
          className="p-1 -mr-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <span className="material-symbols-outlined text-base sm:text-lg">drag_indicator</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="material-symbols-outlined text-sm">business</span>
          <span className="truncate">{deal.accountName}</span>
        </div>

        {deal.contactName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-symbols-outlined text-sm">person</span>
            <span className="truncate">{deal.contactName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-border">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base sm:text-lg text-success">payments</span>
          <span className="font-semibold text-foreground text-xs sm:text-sm">
            {formatCurrencyFull(deal.value)}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="material-symbols-outlined text-xs sm:text-sm">event</span>
          <span>{formatDate(deal.expectedCloseDate)}</span>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Probability</span>
          <span className="font-medium text-foreground">{deal.probability}%</span>
        </div>
        <div className="h-1 sm:h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${deal.probability}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Pipeline Column Component
// =============================================================================

/**
 * Pipeline column component for the kanban board.
 * Displays deals in a specific stage with drag-and-drop support.
 */
function PipelineColumn({
  stage,
  deals,
  onDealNavigate,
}: Readonly<{
  stage: OpportunityStage;
  deals: Deal[];
  onDealNavigate: (dealId: string) => void;
}>) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);

  return (
    <div className="flex-1 min-w-[240px] sm:min-w-[280px] max-w-[300px]">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: config.color }}
          />
          <span className="font-medium text-foreground text-sm sm:text-base truncate">
            {config.label}
          </span>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-xs font-medium text-muted-foreground flex-shrink-0">
            {deals.length}
          </span>
        </div>
        <span className="text-xs sm:text-sm font-medium text-muted-foreground flex-shrink-0">
          {formatCurrencyCompact(totalValue)}
        </span>
      </div>

      {/* Droppable Area */}
      <div className="bg-muted/50 rounded-lg p-2 sm:p-2 h-[300px] sm:h-[500px] overflow-y-auto overscroll-contain scrollbar-thin">
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {deals.map((deal) => (
              <SortableDealCard key={deal.id} deal={deal} onNavigate={() => onDealNavigate(deal.id)} />
            ))}
            {deals.length === 0 && (
              <div className="flex items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground">Drop deals here</p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// =============================================================================
// Main Deals Page Component
// =============================================================================

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  // Fetch opportunities from API
  const {
    data: opportunitiesData,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.opportunity.list.useQuery({
    limit: 100, // Fetch all for kanban view
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  // Transform API response to Deal format
  useEffect(() => {
    if (opportunitiesData?.opportunities) {
      const transformedDeals: Deal[] = opportunitiesData.opportunities.map((opp) => ({
        id: opp.id,
        name: opp.name,
        value: Number(opp.value),
        stage: opp.stage as StageId,
        probability: opp.probability,
        expectedCloseDate: opp.expectedCloseDate?.toString() ?? null,
        accountName: opp.account?.name ?? 'Unknown Account',
        contactName: opp.contact ? `${opp.contact.firstName} ${opp.contact.lastName}` : null,
        ownerId: opp.ownerId,
        ownerName: opp.owner?.name ?? opp.owner?.email ?? 'Unknown',
        createdAt: opp.createdAt?.toString() ?? new Date().toISOString(),
      }));
      setDeals(transformedDeals);
    }
  }, [opportunitiesData]);

  // Mutation for updating opportunity stage
  const updateOpportunity = trpc.opportunity.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Navigate to deal detail page
  const handleDealNavigate = useCallback((dealId: string) => {
    router.push(`/deals/${dealId}`);
  }, [router]);

  // DnD sensors - configured to allow scrolling
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Increased distance to allow scroll gestures
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group deals by stage - uses domain stages as source of truth
  const dealsByStage = useMemo(() => {
    const grouped: Record<StageId, Deal[]> = {
      PROSPECTING: [],
      QUALIFICATION: [],
      NEEDS_ANALYSIS: [],
      PROPOSAL: [],
      NEGOTIATION: [],
      CLOSED_WON: [],
      CLOSED_LOST: [],
    };

    for (const deal of deals) {
      grouped[deal.stage].push(deal);
    }

    return grouped;
  }, [deals]);

  // Chart data - uses domain stages
  const pieChartData = useMemo(() => {
    return OPPORTUNITY_STAGES
      .filter((stage) => !['CLOSED_WON', 'CLOSED_LOST'].includes(stage))
      .map((stage) => ({
        name: PIPELINE_STAGE_CONFIG[stage].label,
        value: dealsByStage[stage].length,
        color: PIPELINE_STAGE_CONFIG[stage].color,
      }));
  }, [dealsByStage]);

  const barChartData = useMemo(() => {
    return OPPORTUNITY_STAGES.map((stage) => ({
      name: PIPELINE_STAGE_CONFIG[stage].label.replace(' ', '\n'),
      revenue: dealsByStage[stage].reduce((sum, deal) => sum + deal.value, 0),
      color: PIPELINE_STAGE_CONFIG[stage].color,
    }));
  }, [dealsByStage]);

  // Pipeline stats
  const pipelineStats = useMemo(() => {
    const activeDeals = deals.filter(
      (d) => !['CLOSED_WON', 'CLOSED_LOST'].includes(d.stage)
    );
    const totalValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
    const weightedValue = activeDeals.reduce(
      (sum, d) => sum + d.value * (d.probability / 100),
      0
    );
    const wonValue = dealsByStage.CLOSED_WON.reduce((sum, d) => sum + d.value, 0);

    return {
      totalDeals: activeDeals.length,
      totalValue,
      weightedValue,
      wonValue,
    };
  }, [deals, dealsByStage]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const deal = deals.find((d) => d.id === active.id);
    if (deal) {
      setActiveDeal(deal);
    }
  }, [deals]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      if (activeId === overId) return;

      const activeDealItem = deals.find((d) => d.id === activeId);
      const overDeal = deals.find((d) => d.id === overId);

      if (!activeDealItem) return;

      // If dropping on a stage (column)
      const targetStage = OPPORTUNITY_STAGES.find((s) => s === overId);
      if (targetStage) {
        // Optimistic update
        setDeals((prev) =>
          prev.map((d) => (d.id === activeId ? { ...d, stage: targetStage } : d))
        );
        // Persist to backend
        updateOpportunity.mutate({ id: activeId, stage: targetStage });
        return;
      }

      // If dropping on another deal
      if (overDeal && activeDealItem.stage !== overDeal.stage) {
        // Move to new stage
        setDeals((prev) =>
          prev.map((d) => (d.id === activeId ? { ...d, stage: overDeal.stage } : d))
        );
        // Persist to backend
        updateOpportunity.mutate({ id: activeId, stage: overDeal.stage });
      } else if (overDeal && activeDealItem.stage === overDeal.stage) {
        // Reorder within same stage
        const stageDeals = deals.filter((d) => d.stage === activeDealItem.stage);
        const oldIndex = stageDeals.findIndex((d) => d.id === activeId);
        const newIndex = stageDeals.findIndex((d) => d.id === overId);

        if (oldIndex !== newIndex) {
          const newOrder = arrayMove(stageDeals, oldIndex, newIndex);
          setDeals((prev) => {
            const otherDeals = prev.filter((d) => d.stage !== activeDealItem.stage);
            return [...otherDeals, ...newOrder];
          });
        }
      }
    },
    [deals, updateOpportunity]
  );

  // Show loading skeleton
  if (isLoading) {
    return <DealsPageSkeleton />;
  }

  // Show error state
  if (isError) {
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

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Active Deals</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {pipelineStats.totalDeals}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Pipeline Value</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {formatCurrencyCompact(pipelineStats.totalValue)}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Weighted Value</p>
          <p className="text-xl sm:text-2xl font-bold text-success mt-1">
            {formatCurrencyCompact(pipelineStats.weightedValue)}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Won This Period</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {formatCurrencyCompact(pipelineStats.wonValue)}
          </p>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
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
        </Card>
      </div>

      {/* Kanban Board */}
      <Card className="p-3 sm:p-4 overflow-x-auto bg-card border-border -mx-4 sm:mx-0 rounded-none sm:rounded-lg">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 sm:gap-4 min-w-max">
            {OPPORTUNITY_STAGES.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                deals={dealsByStage[stage]}
                onDealNavigate={handleDealNavigate}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDeal && (
              <div className="bg-card rounded-lg border-2 border-primary shadow-xl p-3 sm:p-4 w-[220px] sm:w-[280px] opacity-90">
                <h4 className="font-medium text-foreground text-xs sm:text-sm mb-2">
                  {activeDeal.name}
                </h4>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base sm:text-lg text-success">payments</span>
                  <span className="font-semibold text-foreground text-xs sm:text-sm">
                    {formatCurrencyCompact(activeDeal.value)}
                  </span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </Card>
    </>
  );
}
