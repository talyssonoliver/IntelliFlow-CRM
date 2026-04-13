/**
 * TrashList Component (PG-175)
 *
 * Table-based list view for trashed deals using DataTable from @intelliflow/ui.
 * Follows the DealListView pattern with search, pagination, and trash-specific actions.
 */

'use client';

import * as React from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  toast,
  Skeleton,
  EmptyState,
} from '@intelliflow/ui';
import { SearchFilterBar } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { revalidateDealCaches } from '@/app/deals/actions';
import { type TrashedDeal, PIPELINE_STAGE_CONFIG, formatCurrencyFull } from './types';
import { type OpportunityStage } from '@intelliflow/domain';

// =============================================================================
// Constants
// =============================================================================

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { value: 'deleted-newest', label: 'Recently Deleted' },
  { value: 'deleted-oldest', label: 'Oldest Deleted' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'value-high', label: 'Highest Value' },
  { value: 'value-low', label: 'Lowest Value' },
];

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

function formatDate(dateStr: string | null, timezone: string = 'Europe/London'): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

type TrashedSortBy = 'name' | 'value' | 'deletedAt' | 'stage';

function getSortParams(sortOrder: string): { sortBy: TrashedSortBy; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'deleted-oldest':
      return { sortBy: 'deletedAt', sortOrder: 'asc' };
    case 'name-asc':
      return { sortBy: 'name', sortOrder: 'asc' };
    case 'name-desc':
      return { sortBy: 'name', sortOrder: 'desc' };
    case 'value-high':
      return { sortBy: 'value', sortOrder: 'desc' };
    case 'value-low':
      return { sortBy: 'value', sortOrder: 'asc' };
    case 'deleted-newest':
    default:
      return { sortBy: 'deletedAt', sortOrder: 'desc' };
  }
}

// =============================================================================
// Sub-components
// =============================================================================

function StageBadge({ stage }: Readonly<{ stage: OpportunityStage }>) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
      <span
        className="size-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: config.color }}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

// =============================================================================
// Column Definitions
// =============================================================================

interface TrashRowActionHandlers {
  onRestore: (deal: TrashedDeal) => void;
  onPermanentDelete: (deal: TrashedDeal) => void;
}

function createColumns(
  handlers: Readonly<TrashRowActionHandlers>,
  timezone: string = 'Europe/London'
): ColumnDef<TrashedDeal>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Deal Name',
      size: 200,
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground truncate block">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'accountName',
      header: 'Account',
      size: 160,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block">
          {row.original.accountName}
        </span>
      ),
    },
    {
      accessorKey: 'value',
      header: 'Value',
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatCurrencyFull(row.original.value)}
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
      accessorKey: 'deletedAt',
      header: 'Deleted On',
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.deletedAt, timezone)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 100,
      cell: ({ row }) => {
        const deal = row.original;
        return (
          <TableRowActions
            quickActions={[
              {
                icon: 'restore_from_trash',
                label: 'Restore Deal',
                onClick: () => handlers.onRestore(deal),
              },
            ]}
            dropdownActions={[
              {
                icon: 'restore_from_trash',
                label: 'Restore',
                onClick: () => handlers.onRestore(deal),
              },
              { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
              {
                icon: 'delete_forever',
                label: 'Delete Forever',
                variant: 'danger' as const,
                onClick: () => handlers.onPermanentDelete(deal),
              },
            ]}
          />
        );
      },
    },
  ];
}

// =============================================================================
// Main Component
// =============================================================================

export const TrashList = React.memo(function TrashList() {
  const { timezone } = useTimezoneContext();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<string>('deleted-newest');
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dialog state
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [showBulkRestoreDialog, setShowBulkRestoreDialog] = useState(false);
  const [showBulkPermanentDeleteDialog, setShowBulkPermanentDeleteDialog] = useState(false);
  const selectedDealsRef = useRef<TrashedDeal[]>([]);
  const singleDealRef = useRef<TrashedDeal | null>(null);
  const isBulkOperationRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = trpc.useUtils();

  const sortParams = getSortParams(sortOrder);

  const {
    data: trashedData,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.opportunity.listTrashed.useQuery(
    {
      search: debouncedSearch || undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
      limit: PAGE_SIZE,
      page: currentPage,
    },
    {}
  );

  // Mutations
  const restoreMutation = trpc.opportunity.restore.useMutation({
    onSuccess: () => {
      revalidateDealCaches(user?.id ?? null).catch(() => {});
      utils.opportunity.listTrashed.invalidate();
      utils.opportunity.list.invalidate();
      utils.opportunity.stats.invalidate();
      if (!isBulkOperationRef.current) {
        toast({ title: 'Deal Restored', description: 'The deal has been restored.' });
      }
    },
    onError: (err) => {
      if (!isBulkOperationRef.current) {
        toast({ title: 'Restore Failed', description: err.message, variant: 'destructive' });
      }
    },
  });

  const permanentDeleteMutation = trpc.opportunity.permanentDelete.useMutation({
    onSuccess: () => {
      utils.opportunity.listTrashed.invalidate();
      if (!isBulkOperationRef.current) {
        toast({
          title: 'Deal Permanently Deleted',
          description: 'The deal has been permanently removed.',
        });
      }
    },
    onError: (err) => {
      if (!isBulkOperationRef.current) {
        toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
      }
    },
  });

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, sortOrder]);

  // Transform data — let tRPC infer the item type from the router's return type
  const trashedDeals = useMemo((): TrashedDeal[] => {
    if (!trashedData?.opportunities) return [];
    return trashedData.opportunities.map((item) => ({
      id: item.id,
      name: item.name,
      value: Number(item.value) || 0,
      stage: item.stage as OpportunityStage,
      probability: item.probability ?? 0,
      expectedCloseDate: item.expectedCloseDate?.toString() ?? null,
      accountName: item.account?.name ?? 'Unknown Account',
      contactName: item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : null,
      ownerId: item.ownerId ?? '',
      ownerName: item.owner?.name ?? item.owner?.email ?? 'Unknown',
      createdAt: item.createdAt?.toString() ?? '',
      deletedAt: item.deletedAt?.toString() ?? '',
    }));
  }, [trashedData]);

  const totalItems = trashedData?.total ?? 0;
  const hasMore = currentPage * PAGE_SIZE < totalItems;

  // Handlers
  const handleSearch = useCallback((value: string) => setSearchQuery(value), []);

  // Row action handlers
  const rowActionHandlers: TrashRowActionHandlers = useMemo(
    () => ({
      onRestore: (deal) => {
        singleDealRef.current = deal;
        setShowRestoreDialog(true);
      },
      onPermanentDelete: (deal) => {
        singleDealRef.current = deal;
        setShowPermanentDeleteDialog(true);
      },
    }),
    []
  );

  const columns = useMemo(
    () => createColumns(rowActionHandlers, timezone),
    [rowActionHandlers, timezone]
  );

  // Single deal actions
  const handleSingleRestore = useCallback(async () => {
    const deal = singleDealRef.current;
    if (!deal) return;
    setIsSubmitting(true);
    try {
      await restoreMutation.mutateAsync({ id: deal.id });
    } finally {
      setIsSubmitting(false);
      setShowRestoreDialog(false);
      singleDealRef.current = null;
    }
  }, [restoreMutation]);

  const handleSinglePermanentDelete = useCallback(async () => {
    const deal = singleDealRef.current;
    if (!deal) return;
    setIsSubmitting(true);
    try {
      await permanentDeleteMutation.mutateAsync({ id: deal.id });
    } finally {
      setIsSubmitting(false);
      setShowPermanentDeleteDialog(false);
      singleDealRef.current = null;
    }
  }, [permanentDeleteMutation]);

  // Bulk actions
  const handleBulkRestore = useCallback(async () => {
    const selected = selectedDealsRef.current;
    if (selected.length === 0) return;
    setIsSubmitting(true);
    isBulkOperationRef.current = true;
    try {
      const results = await Promise.allSettled(
        selected.map((deal) => restoreMutation.mutateAsync({ id: deal.id }))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        toast({
          title: 'Deals Restored',
          description: `${succeeded} deal(s) restored successfully.`,
        });
      } else if (succeeded === 0) {
        toast({
          title: 'Bulk Restore Failed',
          description: `All ${failed} deal(s) failed to restore.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Partial Restore',
          description: `${succeeded} restored, ${failed} failed.`,
          variant: 'destructive',
        });
      }
    } finally {
      isBulkOperationRef.current = false;
      setIsSubmitting(false);
      setShowBulkRestoreDialog(false);
    }
  }, [restoreMutation]);

  const handleBulkPermanentDelete = useCallback(async () => {
    const selected = selectedDealsRef.current;
    if (selected.length === 0) return;
    setIsSubmitting(true);
    isBulkOperationRef.current = true;
    try {
      const results = await Promise.allSettled(
        selected.map((deal) => permanentDeleteMutation.mutateAsync({ id: deal.id }))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        toast({
          title: 'Deals Permanently Deleted',
          description: `${succeeded} deal(s) permanently removed.`,
        });
      } else if (succeeded === 0) {
        toast({
          title: 'Bulk Delete Failed',
          description: `All ${failed} deal(s) failed to delete.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Partial Delete',
          description: `${succeeded} deleted, ${failed} failed.`,
          variant: 'destructive',
        });
      }
    } finally {
      isBulkOperationRef.current = false;
      setIsSubmitting(false);
      setShowBulkPermanentDeleteDialog(false);
    }
  }, [permanentDeleteMutation]);

  const bulkActions: BulkAction<TrashedDeal>[] = useMemo(
    () => [
      {
        icon: 'restore_from_trash',
        label: 'Restore Selected',
        onClick: (selected) => {
          selectedDealsRef.current = selected;
          setShowBulkRestoreDialog(true);
        },
      },
      {
        icon: 'delete_forever',
        label: 'Delete Forever',
        variant: 'danger',
        onClick: (selected) => {
          selectedDealsRef.current = selected;
          setShowBulkPermanentDeleteDialog(true);
        },
      },
    ],
    []
  );

  const hasFilters = !!debouncedSearch;
  const emptyMessage = hasFilters
    ? 'No trashed deals match your search criteria'
    : 'Your trash is empty. Deleted deals will appear here.';

  return (
    <>
      {/* Search and Sort */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search trashed deals by name or account..."
        searchAriaLabel="Search trashed deals"
        filters={[]}
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
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Failed to load trashed deals
          </h3>
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

      {/* Empty State (no search, truly empty trash) */}
      {!isLoading && !isError && trashedDeals.length === 0 && !debouncedSearch && (
        <EmptyState
          icon="delete"
          title="Trash is empty"
          description="Deleted deals will appear here. You can restore them or permanently remove them."
          size="lg"
          iconColorClass="text-muted-foreground"
          iconBgClass="bg-muted"
        />
      )}

      {/* Data Table */}
      {!isLoading && !isError && (trashedDeals.length > 0 || debouncedSearch) && (
        <DataTable
          columns={columns}
          data={trashedDeals}
          entity="deals"
          emptyMessage={emptyMessage}
          emptyIcon="delete"
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
            {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} trashed deals
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

      {/* Single Restore Dialog */}
      <ConfirmationDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title="Restore Deal"
        description={`Are you sure you want to restore "${singleDealRef.current?.name}"? It will be moved back to your active deals.`}
        confirmLabel="Restore"
        onConfirm={handleSingleRestore}
        isLoading={isSubmitting}
        icon="restore_from_trash"
      />

      {/* Single Permanent Delete Dialog */}
      <ConfirmationDialog
        open={showPermanentDeleteDialog}
        onOpenChange={setShowPermanentDeleteDialog}
        title="Permanently Delete Deal"
        description={`Are you sure you want to permanently delete "${singleDealRef.current?.name}"? This action cannot be undone and all data will be lost forever.`}
        confirmLabel="Delete Forever"
        onConfirm={handleSinglePermanentDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete_forever"
      />

      {/* Bulk Restore Dialog */}
      <ConfirmationDialog
        open={showBulkRestoreDialog}
        onOpenChange={setShowBulkRestoreDialog}
        title="Restore Deals"
        description={`Are you sure you want to restore ${selectedDealsRef.current.length} selected deal(s)? They will be moved back to your active deals.`}
        confirmLabel="Restore All"
        onConfirm={handleBulkRestore}
        isLoading={isSubmitting}
        icon="restore_from_trash"
      />

      {/* Bulk Permanent Delete Dialog */}
      <ConfirmationDialog
        open={showBulkPermanentDeleteDialog}
        onOpenChange={setShowBulkPermanentDeleteDialog}
        title="Permanently Delete Deals"
        description={`Are you sure you want to permanently delete ${selectedDealsRef.current.length} selected deal(s)? This action cannot be undone and all data will be lost forever.`}
        confirmLabel="Delete Forever"
        onConfirm={handleBulkPermanentDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete_forever"
      />
    </>
  );
});
