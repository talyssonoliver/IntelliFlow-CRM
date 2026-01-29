'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { type LeadStatus } from '@intelliflow/domain';
import { PageHeader, SearchFilterBar, type FilterOption } from '@/components/shared';
import { leadStatusOptions } from '@/lib/shared/filter-utils';
import { api } from '@/lib/api';

/**
 * Lead List Page - IFC-014: PHASE-002 Next.js 16.0.10 App Router UI
 *
 * Features:
 * - Full API integration with tRPC
 * - Server-side search, filtering, sorting, and pagination
 * - Debounced search for performance
 * - Loading and error states
 * - WCAG 2.1 AA accessibility compliance
 * - Design matches mockup: docs/design/mockups/lead-list.html
 */

// Lead type from API response
interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: LeadStatus;
  score: number;
  createdAt: Date | string;
  phone?: string | null;
  source?: string;
  owner?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

// Custom hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Score filter options (not domain-driven since it's a computed range)
const SCORE_OPTIONS: FilterOption[] = [
  { value: 'high', label: 'High (80+)' },
  { value: 'medium', label: 'Medium (50-79)' },
  { value: 'low', label: 'Low (<50)' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'score-high', label: 'Highest Score' },
  { value: 'score-low', label: 'Lowest Score' },
];

// =============================================================================
// Column Definitions (factory function - columns are created inside component)
// =============================================================================

// Format date for display
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'Invalid date';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface RowActionHandlers {
  onEdit: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onQualify: (lead: Lead) => void;
  onScore: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}

function createColumns(handlers: RowActionHandlers): ColumnDef<Lead>[] {
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
                {lead.firstName} {lead.lastName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {lead.title ? `${lead.title} @ ${lead.company}` : lead.company}
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
        <a
          href={`mailto:${row.original.email}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-primary hover:underline"
        >
          {row.original.email}
        </a>
      ),
    },
    {
      accessorKey: 'score',
      header: 'Score',
      size: 80,
      cell: ({ row }) => <ScoreBadge score={row.original.score} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 120,
      cell: ({ row }) => {
        const lead = row.original;
        const canQualify = lead.status === 'NEW' || lead.status === 'CONTACTED';
        const canConvert = lead.status === 'QUALIFIED';

        return (
          <TableRowActions
            quickActions={[
              {
                icon: 'phone',
                label: 'Call',
                onClick: () => {
                  if (lead.phone) {
                    window.open(`tel:${lead.phone}`);
                  }
                },
              },
              {
                icon: 'mail',
                label: 'Send Email',
                onClick: () => window.open(`mailto:${lead.email}`),
              },
            ]}
            dropdownActions={[
              {
                icon: 'edit',
                label: 'Edit Lead',
                onClick: () => handlers.onEdit(lead),
              },
              ...(canQualify
                ? [
                    {
                      icon: 'verified',
                      label: 'Qualify Lead',
                      onClick: () => handlers.onQualify(lead),
                    },
                  ]
                : []),
              ...(canConvert
                ? [
                    {
                      icon: 'person_add',
                      label: 'Convert to Contact',
                      onClick: () => handlers.onConvert(lead),
                    },
                  ]
                : []),
              {
                icon: 'auto_awesome',
                label: 'Score with AI',
                onClick: () => handlers.onScore(lead),
              },
              { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
              {
                icon: 'delete',
                label: 'Delete',
                variant: 'danger',
                onClick: () => handlers.onDelete(lead),
              },
            ]}
          />
        );
      },
    },
  ];
}

// =============================================================================
// Lead Status Options for Dialog
// =============================================================================

const LEAD_STATUS_OPTIONS: StatusOption[] = [
  { value: 'NEW', label: 'New', color: 'slate', icon: 'fiber_new', description: 'Newly captured lead' },
  { value: 'CONTACTED', label: 'Contacted', color: 'orange', icon: 'phone_in_talk', description: 'Initial contact made' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'blue', icon: 'verified', description: 'Lead meets qualification criteria' },
  { value: 'NEGOTIATING', label: 'Negotiating', color: 'purple', icon: 'handshake', description: 'Active negotiations in progress' },
  { value: 'UNQUALIFIED', label: 'Unqualified', color: 'red', icon: 'do_not_disturb', description: 'Lead does not meet criteria' },
  { value: 'LOST', label: 'Lost', color: 'slate', icon: 'cancel', description: 'Lead is no longer viable' },
];

// =============================================================================
// Page Component
// =============================================================================

// Map sort option to API parameters
function getSortParams(sortOrder: string): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'score-high':
      return { sortBy: 'score', sortOrder: 'desc' };
    case 'score-low':
      return { sortBy: 'score', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

// Map score filter to min/max score
function getScoreParams(scoreFilter: string): { minScore?: number; maxScore?: number } {
  switch (scoreFilter) {
    case 'high':
      return { minScore: 80 };
    case 'medium':
      return { minScore: 50, maxScore: 79 };
    case 'low':
      return { maxScore: 49 };
    default:
      return {};
  }
}

export default function LeadsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scoreFilter, setScoreFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Debounce search for 300ms to avoid excessive API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dialog state
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Track selected leads for bulk actions
  const selectedLeadsRef = useRef<Lead[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // tRPC utils for query invalidation
  const utils = api.useUtils();

  // Build query parameters
  const sortParams = getSortParams(sortOrder);
  const scoreParams = getScoreParams(scoreFilter);

  // Main data query
  const {
    data,
    isLoading,
    error,
    refetch,
  } = api.lead.list.useQuery({
    page: currentPage,
    limit: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter ? [statusFilter as LeadStatus] : undefined,
    ...scoreParams,
    sortBy: sortParams.sortBy,
    sortOrder: sortParams.sortOrder,
  });

  // tRPC mutations with query invalidation
  const bulkConvertMutation = api.lead.bulkConvert.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
    },
  });
  const bulkUpdateStatusMutation = api.lead.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
    },
  });
  const bulkArchiveMutation = api.lead.bulkArchive.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
    },
  });
  const bulkDeleteMutation = api.lead.bulkDelete.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
    },
  });

  // Single lead mutations for row actions
  const deleteMutation = api.lead.delete.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
      toast({
        title: 'Lead Deleted',
        description: 'The lead has been successfully deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const qualifyMutation = api.lead.qualify.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
      toast({
        title: 'Lead Qualified',
        description: 'The lead has been qualified successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Qualification Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const convertMutation = api.lead.convert.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
      toast({
        title: 'Lead Converted',
        description: 'The lead has been converted to a contact.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Conversion Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const scoreMutation = api.lead.scoreWithAI.useMutation({
    onSuccess: (result) => {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
      toast({
        title: 'Lead Scored',
        description: `New score: ${result.score} (confidence: ${Math.round(result.confidence * 100)}%)`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Scoring Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, scoreFilter, sortOrder]);

  // Extract leads from API response
  const leads = useMemo(() => {
    if (!data?.leads) return [];
    return data.leads as Lead[];
  }, [data]);

  const totalItems = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Handle row click - navigate to lead detail
  const handleRowClick = useCallback(
    (lead: Lead) => {
      router.push(`/leads/${lead.id}`);
    },
    [router]
  );

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleBulkConvert = useCallback(async () => {
    const leads = selectedLeadsRef.current;
    if (leads.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkConvertMutation.mutateAsync({
        ids: leads.map((l) => l.id),
        createAccounts: false,
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Leads Converted',
          description: `Successfully converted ${result.successful.length} lead(s) to contacts.`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some leads could not be converted',
          description: `${result.failed.length} lead(s) failed: ${result.failed[0]?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Conversion Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowConvertDialog(false);
    }
  }, [bulkConvertMutation]);

  const handleBulkStatusUpdate = useCallback(
    async (newStatus: string) => {
      const leads = selectedLeadsRef.current;
      if (leads.length === 0) return;

      setIsSubmitting(true);
      try {
        const result = await bulkUpdateStatusMutation.mutateAsync({
          ids: leads.map((l) => l.id),
          status: newStatus as LeadStatus,
        });

        if (result.successful.length > 0) {
          toast({
            title: 'Status Updated',
            description: `Successfully updated ${result.successful.length} lead(s) to "${newStatus}".`,
          });
        }

        if (result.failed.length > 0) {
          toast({
            title: 'Some updates failed',
            description: `${result.failed.length} lead(s) could not be updated.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Status Update Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
        setShowStatusDialog(false);
      }
    },
    [bulkUpdateStatusMutation]
  );

  const handleBulkArchive = useCallback(async () => {
    const leads = selectedLeadsRef.current;
    if (leads.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkArchiveMutation.mutateAsync({
        ids: leads.map((l) => l.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Leads Archived',
          description: `Successfully archived ${result.successful.length} lead(s).`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some leads could not be archived',
          description: `${result.failed.length} lead(s) failed.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Archive Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowArchiveDialog(false);
    }
  }, [bulkArchiveMutation]);

  const handleBulkDelete = useCallback(async () => {
    const leads = selectedLeadsRef.current;
    if (leads.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkDeleteMutation.mutateAsync({
        ids: leads.map((l) => l.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Leads Deleted',
          description: `Successfully deleted ${result.successful.length} lead(s).`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some leads could not be deleted',
          description: `${result.failed.length} lead(s) failed: ${result.failed[0]?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowDeleteDialog(false);
    }
  }, [bulkDeleteMutation]);

  // Row action handlers
  const rowActionHandlers: RowActionHandlers = useMemo(
    () => ({
      onEdit: (lead) => router.push(`/leads/${lead.id}/edit`),
      onConvert: (lead) =>
        convertMutation.mutate({ leadId: lead.id, createAccount: true }),
      onQualify: (lead) =>
        qualifyMutation.mutate({ leadId: lead.id, reason: 'Manual qualification from list' }),
      onScore: (lead) => scoreMutation.mutate({ leadId: lead.id }),
      onDelete: (lead) => deleteMutation.mutate({ id: lead.id }),
    }),
    [router, convertMutation, qualifyMutation, scoreMutation, deleteMutation]
  );

  // Create columns with row handlers
  const columns = useMemo(
    () => createColumns(rowActionHandlers),
    [rowActionHandlers]
  );

  // Bulk actions for selected leads
  const bulkActions: BulkAction<Lead>[] = useMemo(
    () => [
      {
        icon: 'person_add',
        label: 'Convert to Contacts',
        onClick: (selected) => {
          selectedLeadsRef.current = selected;
          setShowConvertDialog(true);
        },
      },
      {
        icon: 'edit',
        label: 'Update Status',
        onClick: (selected) => {
          selectedLeadsRef.current = selected;
          setShowStatusDialog(true);
        },
      },
      {
        icon: 'archive',
        label: 'Archive',
        onClick: (selected) => {
          selectedLeadsRef.current = selected;
          setShowArchiveDialog(true);
        },
      },
      {
        icon: 'delete',
        label: 'Delete',
        variant: 'danger',
        onClick: (selected) => {
          selectedLeadsRef.current = selected;
          setShowDeleteDialog(true);
        },
      },
    ],
    []
  );

  // Determine empty state message
  const hasFilters = debouncedSearch || statusFilter || scoreFilter;
  const emptyMessage = hasFilters
    ? 'No leads match your search criteria'
    : 'No leads found. Create your first lead to get started.';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Leads' },
        ]}
        title="Lead List"
        description={`Manage and track your potential customers effectively.${totalItems > 0 ? ` (${totalItems} total)` : ''}`}
        actions={[
          {
            label: 'New Lead',
            icon: 'add',
            variant: 'primary',
            href: '/leads/new',
          },
        ]}
      />

      {/* Search and Filters Bar */}
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
            options: SCORE_OPTIONS,
            value: scoreFilter,
            onChange: setScoreFilter,
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
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
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
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Try Again
          </button>
        </div>
      )}

      {/* Data Table - only show when not loading and no error */}
      {!isLoading && !error && (
        <DataTable
          columns={columns}
          data={leads}
          emptyMessage={emptyMessage}
          emptyIcon="person_search"
          onRowClick={handleRowClick}
          enableRowSelection
          bulkActions={bulkActions}
          pageSize={pageSize}
          hidePagination
        />
      )}

      {/* Pagination Info */}
      {!isLoading && !error && totalItems > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
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

      {/* Bulk Convert Confirmation Dialog */}
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

      {/* Bulk Status Update Dialog */}
      <StatusSelectDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        title="Update Lead Status"
        description={`Select a new status for ${selectedLeadsRef.current.length} selected lead(s).`}
        options={LEAD_STATUS_OPTIONS}
        onConfirm={handleBulkStatusUpdate}
        isLoading={isSubmitting}
      />

      {/* Bulk Archive Confirmation Dialog */}
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

      {/* Bulk Delete Confirmation Dialog */}
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

/**
 * Lead Avatar Component
 * Shows initials with color based on name (avatarUrl not available from API)
 */
function LeadAvatar({ lead }: Readonly<{ lead: Lead }>) {
  const initials = `${lead.firstName?.[0] || ''}${lead.lastName?.[0] || ''}`.toUpperCase() || '?';

  // Generate a consistent color based on the name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-amber-200 text-amber-800 border-amber-300',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-emerald-100 text-emerald-700 border-emerald-200',
      'bg-rose-100 text-rose-700 border-rose-200',
      'bg-sky-100 text-sky-700 border-sky-200',
    ];
    const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
    return colors[hash % colors.length];
  };

  return (
    <span
      className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(
        `${lead.firstName}${lead.lastName}`
      )}`}
      aria-label={`Avatar for ${lead.firstName} ${lead.lastName}`}
    >
      {initials}
    </span>
  );
}

/**
 * Status Badge Component
 * Displays lead status with color coding matching the mockup
 */
function StatusBadge({ status }: Readonly<{ status: LeadStatus }>) {
  const config: Record<LeadStatus, { label: string; className: string }> = {
    NEW: {
      label: 'New',
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    },
    CONTACTED: {
      label: 'Contacted',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    },
    QUALIFIED: {
      label: 'Qualified',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    },
    NEGOTIATING: {
      label: 'Negotiating',
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    },
    UNQUALIFIED: {
      label: 'Unqualified',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    },
    CONVERTED: {
      label: 'Converted',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    LOST: {
      label: 'Lost',
      className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
    },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

/**
 * Score Badge Component
 * Displays lead score with color-coded indicator matching the mockup
 * - Green (>=80): High score
 * - Amber (50-79): Medium score
 * - Red (<50): Low score
 */
function ScoreBadge({ score }: Readonly<{ score: number }>) {
  const getScoreConfig = (score: number) => {
    if (score >= 80) {
      return {
        bgClass: 'bg-green-100 dark:bg-green-500/20',
        textClass: 'text-green-700 dark:text-green-400',
        dotClass: 'bg-green-500',
        borderClass: 'border-green-200 dark:border-green-500/20',
      };
    }
    if (score >= 50) {
      return {
        bgClass: 'bg-amber-100 dark:bg-amber-500/20',
        textClass: 'text-amber-700 dark:text-amber-400',
        dotClass: 'bg-amber-500',
        borderClass: 'border-amber-200 dark:border-amber-500/20',
      };
    }
    return {
      bgClass: 'bg-red-100 dark:bg-red-500/20',
      textClass: 'text-red-700 dark:text-red-400',
      dotClass: 'bg-red-500',
      borderClass: 'border-red-200 dark:border-red-500/20',
    };
  };

  const { bgClass, textClass, dotClass, borderClass } = getScoreConfig(score);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border ${borderClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {score}
    </span>
  );
}
