'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  ConfirmationDialog,
  StatusSelectDialog,
  toast,
  Skeleton,
} from '@intelliflow/ui';
import { type LeadStatus } from '@intelliflow/domain';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';
import { leadStatusOptions } from '@/lib/shared/filter-utils';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { invalidateLeadsCache } from '@/app/leads/(list)/actions';
import { revalidateLeadCaches, revalidateLeadConversionCaches } from '@/app/leads/actions';
import type { Lead } from '@/lib/leads/lead-types';
import { leadDisplayName, leadListSubtitle } from '@/lib/leads/lead-format';
import { LeadAvatar } from '@/components/leads/LeadAvatar';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import { LeadCardList } from '@/components/leads/LeadCardList';
import {
  emailComposeHref,
  formatLeadListDate,
  leadMenuActions,
  leadQuickActions,
  type LeadRowActionHandlers,
} from '@/lib/leads/lead-row-actions';
import { LeadStatusBadge } from '@/components/leads/lead-detail';
import {
  LEAD_STATUS_OPTIONS,
  LEAD_SORT_OPTIONS,
  SCORE_FILTER_OPTIONS,
  buildLeadBulkActions,
  createBulkActionRunners,
  getLeadScope,
  getScoreParams,
  getSortParams,
  type BulkDialogKind,
} from '@/lib/leads/bulk-actions';
import { useLeadRecentViews } from '@/lib/leads/use-lead-recent-views';
import { buildListConvertPayload } from '@/lib/leads/lead-conversion';

/**
 * Lead List — extracted client component (PG-059).
 *
 * Caller-agnostic composition of shared primitives:
 *   PageHeader · SearchFilterBar · DataTable · ConfirmationDialog · StatusSelectDialog
 * Wires the six tRPC mutations and four bulk runners from bulk-actions.ts.
 */

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function createColumns(
  handlers: LeadRowActionHandlers,
  timezone: string = 'Europe/London'
): ColumnDef<Lead>[] {
  return [
    {
      accessorKey: 'firstName',
      header: 'Lead Name / Company',
      size: 250,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <div className="flex items-center gap-3">
            <LeadAvatar lead={lead} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {leadDisplayName(lead)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {leadListSubtitle(lead)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      size: 220,
      cell: ({ row }) => (
        <EntityHoverCard email={row.original.email} displayName={leadDisplayName(row.original)}>
          <a
            href={emailComposeHref(row.original.email)}
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-primary hover:underline"
          >
            {row.original.email}
          </a>
        </EntityHoverCard>
      ),
    },
    {
      accessorKey: 'score',
      header: 'Score',
      size: 80,
      cell: ({ row }) => (
        <LeadScoreBadge
          score={row.original.score}
          scoringStatus={row.original.scoringStatus}
          scoreConfidence={row.original.scoreConfidence}
        />
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => <LeadStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {formatLeadListDate(row.original.createdAt, timezone)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 120,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <TableRowActions
            quickActions={leadQuickActions(lead)}
            dropdownActions={leadMenuActions(lead, handlers)}
          />
        );
      },
    },
  ];
}

export interface LeadListProps {
  readonly initialData?: unknown;
}

function reportCacheRevalidationError(error: unknown) {
  console.error('Failed to revalidate lead caches:', error);
}

export default function LeadList({ initialData: serverData }: LeadListProps = {}) {
  const { timezone } = useTimezoneContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scoreFilter, setScoreFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { recentIds, push: pushRecentView } = useLeadRecentViews();

  // Sidebar-driven scope: /leads?view=my|starred|recent OR /leads?segment=new-week|hot|followup|waiting
  const scope = useMemo(
    () =>
      getLeadScope(
        searchParams?.get('view'),
        searchParams?.get('segment'),
        user?.id ?? null,
        new Date(),
        recentIds
      ),
    [searchParams, user?.id, recentIds]
  );

  // Reset to page 1 whenever the scope (view/segment) changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [scope.view, scope.segment]);

  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const selectedLeadsRef = useRef<Lead[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = api.useUtils();

  const sortParams = getSortParams(sortOrder);
  const scoreParams = getScoreParams(scoreFilter);

  const isDefaultQuery =
    currentPage === 1 &&
    !debouncedSearch &&
    !statusFilter &&
    !scoreFilter &&
    sortOrder === 'newest' &&
    scope.view === 'all' &&
    scope.segment === null;

  // Scope params (from view/segment) merge with the in-page filters; in-page filters win on a clash.
  const statusFromScope = scope.params.status ? [...scope.params.status] : undefined;
  const statusForQuery = statusFilter ? [statusFilter as LeadStatus] : statusFromScope;

  const { data, isLoading, error, refetch } = api.lead.list.useQuery(
    {
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch || undefined,
      status: statusForQuery,
      ownerId: scope.params.ownerId,
      dateFrom: scope.params.dateFrom,
      dateTo: scope.params.dateTo,
      lastContactedBefore: scope.params.lastContactedBefore,
      isStarred: scope.params.isStarred,
      waitingForReply: scope.params.waitingForReply,
      ids: scope.params.ids ? [...scope.params.ids] : undefined,
      minScore: scoreParams.minScore ?? scope.params.minScore,
      maxScore: scoreParams.maxScore ?? scope.params.maxScore,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
    },
    {
      enabled: isAuthenticated && !authLoading,
      initialData:
        isDefaultQuery && serverData
          ? (serverData as NonNullable<Parameters<typeof api.lead.list.useQuery>[1]>['initialData'])
          : undefined,
    }
  );

  const isAuthError =
    error?.data?.code === 'UNAUTHORIZED' ||
    error?.message?.toLowerCase().includes('authentication') ||
    error?.message?.toLowerCase().includes('unauthorized');

  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Refreshes client queries + server caches after a lead mutation. Returned from
  // onSuccess so the mutation stays pending until the list has refetched. The
  // server-cache revalidation is best-effort: a failure is logged and never
  // turns a successful mutation into a failed one.
  const refreshLeads = (
    revalidate: (userId: string) => Promise<void>,
    { stats = true }: { stats?: boolean } = {}
  ) =>
    Promise.all([
      utils.lead.list.invalidate(),
      stats ? utils.lead.stats.invalidate() : undefined,
      invalidateLeadsCache().catch(reportCacheRevalidationError),
      user?.id ? revalidate(user.id).catch(reportCacheRevalidationError) : undefined,
    ]);

  const bulkConvertMutation = api.lead.bulkConvert.useMutation({
    onSuccess: () => refreshLeads(revalidateLeadConversionCaches),
  });
  const bulkUpdateStatusMutation = api.lead.bulkUpdateStatus.useMutation({
    onSuccess: () => refreshLeads(revalidateLeadCaches),
  });
  const bulkArchiveMutation = api.lead.bulkArchive.useMutation({
    onSuccess: () => refreshLeads(revalidateLeadCaches),
  });
  const bulkDeleteMutation = api.lead.bulkDelete.useMutation({
    onSuccess: () => refreshLeads(revalidateLeadCaches),
  });

  const deleteMutation = api.lead.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Lead Deleted', description: 'The lead has been successfully deleted.' });
      return refreshLeads(revalidateLeadCaches);
    },
    onError: (err) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const qualifyMutation = api.lead.qualify.useMutation({
    onSuccess: () => {
      toast({
        title: 'Lead Qualified',
        description: 'The lead has been qualified successfully.',
      });
      return refreshLeads(revalidateLeadCaches);
    },
    onError: (err) => {
      toast({ title: 'Qualification Failed', description: err.message, variant: 'destructive' });
    },
  });

  const convertMutation = api.lead.convert.useMutation({
    onSuccess: () => {
      toast({
        title: 'Lead Converted',
        description: 'The lead has been converted to a contact.',
      });
      return refreshLeads(revalidateLeadConversionCaches);
    },
    onError: (err) => {
      toast({ title: 'Conversion Failed', description: err.message, variant: 'destructive' });
    },
  });

  const scoreMutation = api.lead.scoreWithAI.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Lead Scored',
        description: `New score: ${result.score} (confidence: ${Math.round(result.confidence * 100)}%)`,
      });
    },
    onError: (err) => {
      toast({ title: 'Scoring Failed', description: err.message, variant: 'destructive' });
    },
    // #1218: a failed scoring marks the lead FAILED, so the list is refreshed either way.
    onSettled: () => refreshLeads(revalidateLeadCaches),
  });

  const setStarredMutation = api.lead.setStarred.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.isStarred ? 'Lead Starred' : 'Star Removed',
        description: result.isStarred
          ? 'Find it later under Sidebar → Starred.'
          : 'The lead is no longer starred.',
      });
      return refreshLeads(revalidateLeadCaches, { stats: false });
    },
    onError: (err) => {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, scoreFilter, sortOrder]);

  const leads = useMemo(() => {
    if (!data?.data) return [];
    return data.data as Lead[];
  }, [data]);

  const totalItems = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleRowClick = useCallback(
    (lead: Lead) => {
      pushRecentView(lead.id);
      router.push(`/leads/${lead.id}`);
    },
    [router, pushRecentView]
  );

  const openDialog = useCallback((kind: BulkDialogKind) => {
    if (kind === 'convert') setShowConvertDialog(true);
    else if (kind === 'status') setShowStatusDialog(true);
    else if (kind === 'archive') setShowArchiveDialog(true);
    else if (kind === 'delete') setShowDeleteDialog(true);
  }, []);

  const setSelectedLeads = useCallback((selected: Lead[]) => {
    selectedLeadsRef.current = selected;
  }, []);

  const runners = useMemo(
    () =>
      createBulkActionRunners(
        {
          bulkConvert: bulkConvertMutation,
          bulkUpdateStatus: bulkUpdateStatusMutation,
          bulkArchive: bulkArchiveMutation,
          bulkDelete: bulkDeleteMutation,
        },
        (input) => toast(input),
        () => {
          setIsSubmitting(false);
          setShowConvertDialog(false);
          setShowStatusDialog(false);
          setShowArchiveDialog(false);
          setShowDeleteDialog(false);
        }
      ),
    [bulkConvertMutation, bulkUpdateStatusMutation, bulkArchiveMutation, bulkDeleteMutation]
  );

  const handleBulkConvert = useCallback(async () => {
    setIsSubmitting(true);
    await runners.runConvert(selectedLeadsRef.current);
  }, [runners]);

  const handleBulkStatusUpdate = useCallback(
    async (newStatus: string) => {
      setIsSubmitting(true);
      await runners.runUpdateStatus(selectedLeadsRef.current, newStatus as LeadStatus);
    },
    [runners]
  );

  const handleBulkArchive = useCallback(async () => {
    setIsSubmitting(true);
    await runners.runArchive(selectedLeadsRef.current);
  }, [runners]);

  const handleBulkDelete = useCallback(async () => {
    setIsSubmitting(true);
    await runners.runDelete(selectedLeadsRef.current);
  }, [runners]);

  const rowActionHandlers: LeadRowActionHandlers = useMemo(
    () => ({
      onEdit: (lead) => router.push(`/leads/${lead.id}/edit`),
      onConvert: (lead) => convertMutation.mutate(buildListConvertPayload(lead)),
      onQualify: (lead) =>
        qualifyMutation.mutate({ leadId: lead.id, reason: 'Manual qualification from list' }),
      onScore: (lead) => scoreMutation.mutate({ leadId: lead.id }),
      onToggleStar: (lead) =>
        setStarredMutation.mutate({ id: lead.id, starred: !(lead.isStarred ?? false) }),
      onDelete: (lead) => deleteMutation.mutate({ id: lead.id }),
    }),
    [router, convertMutation, qualifyMutation, scoreMutation, setStarredMutation, deleteMutation]
  );

  const columns = useMemo(
    () => createColumns(rowActionHandlers, timezone),
    [rowActionHandlers, timezone]
  );

  const bulkActions = useMemo(
    () => buildLeadBulkActions({ setSelected: setSelectedLeads, openDialog }),
    [setSelectedLeads, openDialog]
  );

  const hasFilters = debouncedSearch || statusFilter || scoreFilter;
  const emptyMessage = hasFilters
    ? 'No leads match your search criteria'
    : 'No leads found. Create your first lead to get started.';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          scope.view === 'all' && scope.segment === null
            ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leads' }]
            : [
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Leads', href: '/leads' },
                { label: scope.title },
              ]
        }
        title={scope.title}
        description={scope.description + (totalItems > 0 ? ` (${totalItems} total)` : '')}
        actions={[
          {
            label: 'Import',
            icon: 'upload',
            variant: 'secondary',
            hideOnMobile: true,
            href: '/leads/import',
          },
          {
            label: 'New Lead',
            icon: 'add',
            variant: 'primary',
            href: '/leads/new',
          },
        ]}
      />

      {scope.pendingNotice && (
        <output
          aria-live="polite"
          data-testid="lead-scope-pending-notice"
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            info
          </span>
          <span>{scope.pendingNotice}</span>
        </output>
      )}

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search leads by name, email, or company..."
        searchAriaLabel="Search leads"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'filter_list',
            options: leadStatusOptions(),
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            id: 'score',
            label: 'Score',
            icon: 'military_tech',
            options: [...SCORE_FILTER_OPTIONS],
            value: scoreFilter,
            onChange: setScoreFilter,
          },
        ]}
        sort={{
          options: [...LEAD_SORT_OPTIONS],
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {isLoading && (
        <div className="space-y-3">
          {(['lead-sk-0', 'lead-sk-1', 'lead-sk-2', 'lead-sk-3', 'lead-sk-4'] as const).map(
            (skKey) => (
              <div
                key={skKey}
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            )
          )}
        </div>
      )}

      {error && isAuthError && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8">
          <span className="material-symbols-outlined text-[48px] text-slate-400 mb-4 animate-spin">
            progress_activity
          </span>
          <p className="text-slate-600 dark:text-slate-400">Redirecting to login...</p>
        </div>
      )}

      {error && !isAuthError && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="material-symbols-outlined text-[48px] text-red-500 mb-4">error</span>
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
            Failed to load leads
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center max-w-md">
            {error.message || 'An unexpected error occurred while fetching leads.'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span> Try Again
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <LeadCardList
            className="md:hidden"
            leads={leads}
            handlers={rowActionHandlers}
            onOpen={handleRowClick}
            timezone={timezone}
            emptyMessage={emptyMessage}
          />
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={leads}
              entity="leads"
              emptyMessage={emptyMessage}
              emptyIcon="person_search"
              onRowClick={handleRowClick}
              enableRowSelection
              bulkActions={bulkActions}
              pageSize={pageSize}
              hidePagination
            />
          </div>
        </>
      )}

      {!isLoading && !error && totalItems > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalItems)} of {totalItems} leads
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5">
              Page {currentPage} of {Math.ceil(totalItems / pageSize)}
            </span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        title="Convert Leads to Contacts"
        description={`Are you sure you want to convert ${selectedLeadsRef.current.length} selected lead(s) to contacts? Only qualified leads can be converted.`}
        confirmLabel="Convert"
        onConfirm={handleBulkConvert}
        isLoading={isSubmitting}
        icon="person_add"
      />

      <StatusSelectDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        title="Update Lead Status"
        description={`Select a new status for ${selectedLeadsRef.current.length} selected lead(s).`}
        options={[...LEAD_STATUS_OPTIONS]}
        onConfirm={handleBulkStatusUpdate}
        isLoading={isSubmitting}
      />

      <ConfirmationDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        title="Archive Leads"
        description={`Are you sure you want to archive ${selectedLeadsRef.current.length} selected lead(s)? This will set their status to Lost.`}
        confirmLabel="Archive"
        onConfirm={handleBulkArchive}
        isLoading={isSubmitting}
        icon="archive"
      />

      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Leads"
        description={`Are you sure you want to permanently delete ${selectedLeadsRef.current.length} selected lead(s)? This action cannot be undone. Converted leads cannot be deleted.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete"
      />
    </div>
  );
}
