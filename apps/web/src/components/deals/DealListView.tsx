/**
 * DealListView Component
 *
 * Table-based list view for deals using DataTable from @intelliflow/ui.
 * Follows the lead list page pattern with search, filters, pagination.
 */

import * as React from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  StatusSelectDialog,
  type StatusOption,
  toast,
  Skeleton,
} from '@intelliflow/ui';
import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';
import { SearchFilterBar, type FilterOption } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { revalidateDealCaches } from '@/app/deals/actions';
import { type Deal, PIPELINE_STAGE_CONFIG, formatDealValue, transformDeals } from './types';
import { DealAvatar, ProbabilityBar, StageBadge, formatDate } from './DealBadges';
import { DealPhoneCards, usePhoneLayout } from './DealPhoneCards';

// =============================================================================
// Constants
// =============================================================================

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'value-high', label: 'Highest Value' },
  { value: 'value-low', label: 'Lowest Value' },
  { value: 'close-date', label: 'Close Date' },
];

const STAGE_STATUS_OPTIONS: StatusOption[] = OPPORTUNITY_STAGES.filter(
  (s) => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST'
).map((stage) => ({
  value: stage,
  label: PIPELINE_STAGE_CONFIG[stage].label,
  color: 'blue',
  icon: 'trending_up',
  description: `Move to ${PIPELINE_STAGE_CONFIG[stage].label}`,
}));

// =============================================================================
// Helpers
// =============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function formatRelativeDate(dateStr: string, timezone: string = 'Europe/London'): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

function getSortParams(sortOrder: string): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'value-high':
      return { sortBy: 'value', sortOrder: 'desc' };
    case 'value-low':
      return { sortBy: 'value', sortOrder: 'asc' };
    case 'close-date':
      return { sortBy: 'expectedCloseDate', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

// =============================================================================
// Column Definitions
// =============================================================================

interface RowActionHandlers {
  onEdit: (deal: Deal) => void;
  onMoveStage: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

/** The row actions for one deal, shared by the table's actions column and the phone cards. */
export function renderDealRowActions(deal: Deal, handlers: Readonly<RowActionHandlers>) {
  const isClosed = deal.stage === 'CLOSED_WON' || deal.stage === 'CLOSED_LOST';
  return (
    <TableRowActions
      quickActions={[
        {
          icon: 'visibility',
          label: 'View Deal',
          onClick: () => handlers.onEdit(deal),
        },
      ]}
      dropdownActions={[
        {
          icon: 'edit',
          label: 'Edit Deal',
          onClick: () => handlers.onEdit(deal),
        },
        ...(isClosed
          ? []
          : [
              {
                icon: 'swap_horiz',
                label: 'Move Stage',
                onClick: () => handlers.onMoveStage(deal),
              },
            ]),
        { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
        {
          icon: 'delete',
          label: 'Delete',
          variant: 'danger' as const,
          onClick: () => handlers.onDelete(deal),
        },
      ]}
    />
  );
}

function createColumns(
  handlers: Readonly<RowActionHandlers>,
  timezone: string = 'Europe/London',
  currency: string = 'GBP'
): ColumnDef<Deal>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Deal / Account',
      size: 280,
      cell: ({ row }) => {
        const deal = row.original;
        return (
          <div className="flex items-center gap-3">
            <DealAvatar deal={deal} />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">{deal.name}</span>
              <span className="text-xs text-muted-foreground truncate">{deal.accountName}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'value',
      header: 'Value',
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatDealValue(row.original.value, currency)}
        </span>
      ),
    },
    {
      accessorKey: 'stage',
      header: 'Stage',
      size: 150,
      cell: ({ row }) => <StageBadge stage={row.original.stage} />,
    },
    {
      accessorKey: 'probability',
      header: 'Probability',
      size: 130,
      cell: ({ row }) => <ProbabilityBar probability={row.original.probability} />,
    },
    {
      accessorKey: 'expectedCloseDate',
      header: 'Close Date',
      size: 110,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.expectedCloseDate, timezone)}
        </span>
      ),
    },
    {
      accessorKey: 'ownerName',
      header: 'Owner',
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate">{row.original.ownerName}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(row.original.createdAt, timezone)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 100,
      cell: ({ row }) => renderDealRowActions(row.original, handlers),
    },
  ];
}

// =============================================================================
// Main Component
// =============================================================================

export const DealListView = React.memo(function DealListView() {
  const { timezone } = useTimezoneContext();
  const currency = useTenantCurrency();
  const phone = usePhoneLayout();
  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkStageDialog, setShowBulkStageDialog] = useState(false);
  const selectedDealsRef = useRef<Deal[]>([]);
  const singleDealRef = useRef<Deal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = trpc.useUtils();

  // Build query params
  const sortParams = getSortParams(sortOrder);

  const {
    data: opportunitiesData,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.opportunity.list.useQuery(
    {
      search: debouncedSearch || undefined,
      stage: stageFilter ? [stageFilter as OpportunityStage] : undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
      limit: PAGE_SIZE,
      page: currentPage,
    },
    {}
  );

  // Server-side cache revalidation. A failure must not turn a successful
  // mutation into a failed one, so it is logged rather than rethrown.
  const revalidateServerCaches = async () => {
    try {
      await revalidateDealCaches(user?.id ?? null);
    } catch (error) {
      console.error('[DealListView] Failed to revalidate deal caches:', error);
    }
  };

  // Returned from onSuccess so each mutation stays pending until the list and
  // stats have refetched.
  const refreshDealData = () =>
    Promise.all([
      revalidateServerCaches(),
      utils.opportunity.list.invalidate(),
      utils.opportunity.stats.invalidate(),
    ]);

  // Mutations
  const updateMutation = trpc.opportunity.update.useMutation({
    onSuccess: refreshDealData,
  });

  const deleteMutation = trpc.opportunity.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Deal Deleted', description: 'The deal has been removed.' });
      return refreshDealData();
    },
    onError: (err) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  // NP-024: Bulk stage update — single round-trip replaces N per-deal mutations
  const bulkUpdateStageMutation = trpc.opportunity.bulkUpdateStage.useMutation({
    onSuccess: refreshDealData,
  });

  // NP-025: Bulk delete — single round-trip replaces N per-deal mutations
  const bulkDeleteMutation = trpc.opportunity.bulkDelete.useMutation({
    onSuccess: refreshDealData,
  });

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, stageFilter, sortOrder]);

  // Transform data
  const deals = useMemo(() => transformDeals(opportunitiesData), [opportunitiesData]);

  const totalItems = opportunitiesData?.total ?? 0;
  const hasMore = deals.length === PAGE_SIZE && currentPage * PAGE_SIZE < totalItems;

  // Stage filter options
  const stageFilterOptions: FilterOption[] = useMemo(
    () =>
      OPPORTUNITY_STAGES.map((s) => ({
        value: s,
        label: PIPELINE_STAGE_CONFIG[s].label,
      })),
    []
  );

  // Handlers
  const handleRowClick = useCallback((deal: Deal) => router.push(`/deals/${deal.id}`), [router]);

  const handleSearch = useCallback((value: string) => setSearchQuery(value), []);

  // Row action handlers
  const rowActionHandlers: RowActionHandlers = useMemo(
    () => ({
      onEdit: (deal) => router.push(`/deals/${deal.id}`),
      onMoveStage: (deal) => {
        singleDealRef.current = deal;
        setShowStageDialog(true);
      },
      onDelete: (deal) => {
        singleDealRef.current = deal;
        setShowDeleteDialog(true);
      },
    }),
    [router]
  );

  const columns = useMemo(
    () => createColumns(rowActionHandlers, timezone, currency),
    [rowActionHandlers, timezone, currency]
  );

  // Single deal actions
  const handleSingleDelete = useCallback(async () => {
    const deal = singleDealRef.current;
    if (!deal) return;
    setIsSubmitting(true);
    try {
      await deleteMutation.mutateAsync({ id: deal.id });
    } finally {
      setIsSubmitting(false);
      setShowDeleteDialog(false);
      singleDealRef.current = null;
    }
  }, [deleteMutation]);

  const handleSingleStageChange = useCallback(
    async (newStage: string) => {
      const deal = singleDealRef.current;
      if (!deal) return;
      setIsSubmitting(true);
      try {
        await updateMutation.mutateAsync({ id: deal.id, stage: newStage as OpportunityStage });
        toast({
          title: 'Stage Updated',
          description: `${deal.name} moved to ${PIPELINE_STAGE_CONFIG[newStage as OpportunityStage]?.label ?? newStage}.`,
        });
      } catch (err) {
        toast({
          title: 'Stage Update Failed',
          description: err instanceof Error ? err.message : 'An error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
        setShowStageDialog(false);
        singleDealRef.current = null;
      }
    },
    [updateMutation]
  );

  // Bulk actions
  const handleBulkStageChange = useCallback(
    async (newStage: string) => {
      const selected = selectedDealsRef.current;
      if (selected.length === 0) return;
      setIsSubmitting(true);
      try {
        // NP-024: single bulk mutation instead of Promise.all over N per-deal mutations
        await bulkUpdateStageMutation.mutateAsync({
          ids: selected.map((deal) => deal.id),
          stage: newStage as OpportunityStage,
        });
        toast({
          title: 'Deals Updated',
          description: `${selected.length} deal(s) moved to ${PIPELINE_STAGE_CONFIG[newStage as OpportunityStage]?.label ?? newStage}.`,
        });
      } catch (err) {
        toast({
          title: 'Bulk Update Failed',
          description: err instanceof Error ? err.message : 'An error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
        setShowBulkStageDialog(false);
      }
    },
    [bulkUpdateStageMutation]
  );

  const handleBulkDelete = useCallback(async () => {
    const selected = selectedDealsRef.current;
    if (selected.length === 0) return;
    setIsSubmitting(true);
    try {
      // NP-025: single bulk mutation instead of Promise.all over N per-deal mutations
      await bulkDeleteMutation.mutateAsync({ ids: selected.map((deal) => deal.id) });
      toast({
        title: 'Deals Deleted',
        description: `${selected.length} deal(s) deleted.`,
      });
    } catch (err) {
      toast({
        title: 'Bulk Delete Failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowBulkDeleteDialog(false);
    }
  }, [bulkDeleteMutation]);

  const bulkActions: BulkAction<Deal>[] = useMemo(
    () => [
      {
        icon: 'swap_horiz',
        label: 'Move Stage',
        onClick: (selected) => {
          selectedDealsRef.current = selected;
          setShowBulkStageDialog(true);
        },
      },
      {
        icon: 'delete',
        label: 'Delete',
        variant: 'danger',
        onClick: (selected) => {
          selectedDealsRef.current = selected;
          setShowBulkDeleteDialog(true);
        },
      },
    ],
    []
  );

  const hasFilters = debouncedSearch || stageFilter;
  const emptyMessage = hasFilters
    ? 'No deals match your search criteria'
    : 'No deals found. Create your first deal to get started.';

  return (
    <>
      {/* Search and Filters */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search deals by name or account..."
        searchAriaLabel="Search deals"
        filters={[
          {
            id: 'stage',
            label: 'Stage',
            icon: 'filter_list',
            options: stageFilterOptions,
            value: stageFilter,
            onChange: setStageFilter,
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {(['sk-0', 'sk-1', 'sk-2', 'sk-3', 'sk-4'] as const).map((skKey) => (
            <div
              key={skKey}
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
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-destructive/10 rounded-lg border border-destructive">
          <span className="material-symbols-outlined text-[48px] text-destructive mb-4">error</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load deals</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            {error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span> Try Again
          </button>
        </div>
      )}

      {/* Phone: a card per deal with its stage and probability (the table hides them below md) */}
      {!isLoading && !isError && phone && deals.length > 0 && (
        <DealPhoneCards
          deals={deals}
          timezone={timezone}
          renderActions={(deal) => renderDealRowActions(deal, rowActionHandlers)}
        />
      )}

      {/* Data Table */}
      {!isLoading && !isError && !(phone && deals.length > 0) && (
        <DataTable
          columns={columns}
          data={deals}
          entity="deals"
          emptyMessage={emptyMessage}
          emptyIcon="handshake"
          onRowClick={handleRowClick}
          enableRowSelection
          bulkActions={bulkActions}
          pageSize={PAGE_SIZE}
          hidePagination
        />
      )}

      {/* Pagination */}
      {!isLoading && !isError && totalItems > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} deals
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5">
              Page {currentPage} of {Math.ceil(totalItems / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Single Delete Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Deal"
        description={`Are you sure you want to delete "${singleDealRef.current?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleSingleDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete"
      />

      {/* Single Stage Change Dialog */}
      <StatusSelectDialog
        open={showStageDialog}
        onOpenChange={setShowStageDialog}
        title="Move Deal Stage"
        description={`Select a new stage for "${singleDealRef.current?.name}".`}
        options={STAGE_STATUS_OPTIONS}
        onConfirm={handleSingleStageChange}
        isLoading={isSubmitting}
      />

      {/* Bulk Stage Change Dialog */}
      <StatusSelectDialog
        open={showBulkStageDialog}
        onOpenChange={setShowBulkStageDialog}
        title="Move Deals"
        description={`Select a new stage for ${selectedDealsRef.current.length} selected deal(s).`}
        options={STAGE_STATUS_OPTIONS}
        onConfirm={handleBulkStageChange}
        isLoading={isSubmitting}
      />

      {/* Bulk Delete Dialog */}
      <ConfirmationDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        title="Delete Deals"
        description={`Are you sure you want to permanently delete ${selectedDealsRef.current.length} selected deal(s)? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete"
      />
    </>
  );
});
