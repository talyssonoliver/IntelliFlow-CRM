'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  toast,
  Skeleton,
  Pagination,
} from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, type FilterOption } from '@/components/shared';
import { api } from '@/lib/api';
import { CONTACT_STATUSES } from '@intelliflow/domain';
import { useContactFilterOptions, isValidUUID } from '@/hooks/use-dynamic-filters';
// Design system: Use Material Symbols Outlined instead of Lucide

/**
 * Contacts List Page - Full API Integration
 *
 * Features:
 * - Full API integration with tRPC
 * - Server-side search, filtering, sorting, and pagination
 * - Debounced search for performance
 * - Loading and error states
 * - Bulk operations (email, export, delete)
 */

// =============================================================================
// Types
// =============================================================================

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  department: string | null;
  accountId: string | null;
  status: (typeof CONTACT_STATUSES)[number];
  createdAt: Date | string;
  owner?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  account?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    opportunities: number;
    tasks: number;
  };
}

// =============================================================================
// Hooks
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

function getSortParams(sortOrder: string): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'name':
      return { sortBy: 'lastName', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';

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

// =============================================================================
// Filter Options (Sort options only - status/department/account are dynamic)
// =============================================================================

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

// =============================================================================
// Column Definitions (factory function - columns are created inside component)
// =============================================================================

interface RowActionHandlers {
  onEdit: (contact: Contact) => void;
  onCreateDeal: (contact: Contact) => void;
  onCreateTicket: (contact: Contact) => void;
  onScheduleMeeting: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

function createColumns(handlers: RowActionHandlers): ColumnDef<Contact>[] {
  return [
    {
      accessorKey: 'firstName',
      header: 'Contact Name',
      size: 220,
      cell: ({ row }) => {
        const contact = row.original;
        const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase() || '?';
        return (
          <div className="flex items-center gap-3">
            <ContactAvatar name={`${contact.firstName}${contact.lastName}`} initials={initials} />
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {contact.firstName} {contact.lastName}
              </p>
              {contact.title && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {contact.title}
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'account',
      header: 'Account',
      size: 180,
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">
            {row.original.account?.name || '-'}
          </p>
          {row.original.department && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {row.original.department}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      size: 200,
      cell: ({ row }) => (
        <a
          href={`mailto:${row.original.email}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline text-sm"
        >
          {row.original.email}
        </a>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      size: 140,
      cell: ({ row }) => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {row.original.phone || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Added',
      size: 100,
      cell: ({ row }) => (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'activity',
      header: 'Activity',
      size: 120,
      cell: ({ row }) => <ActivityBadge contact={row.original} />,
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 120,
      cell: ({ row }) => {
        const contact = row.original;
        return (
          <TableRowActions
            quickActions={[
              {
                icon: 'phone',
                label: 'Call',
                onClick: () => {
                  if (contact.phone) {
                    window.open(`tel:${contact.phone}`);
                  }
                },
              },
              {
                icon: 'mail',
                label: 'Send Email',
                onClick: () => window.open(`mailto:${contact.email}`),
              },
            ]}
            dropdownActions={[
              {
                icon: 'edit',
                label: 'Edit Contact',
                onClick: () => handlers.onEdit(contact),
              },
              {
                icon: 'handshake',
                label: 'Create Deal',
                onClick: () => handlers.onCreateDeal(contact),
              },
              {
                icon: 'confirmation_number',
                label: 'Create Ticket',
                onClick: () => handlers.onCreateTicket(contact),
              },
              {
                icon: 'event',
                label: 'Schedule Meeting',
                onClick: () => handlers.onScheduleMeeting(contact),
              },
              { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
              {
                icon: 'delete',
                label: 'Delete',
                variant: 'danger',
                onClick: () => handlers.onDelete(contact),
              },
            ]}
          />
        );
      },
    },
  ];
}

// =============================================================================
// Page Component
// =============================================================================

export default function ContactsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Debounce search for 300ms to avoid excessive API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track selected contacts for bulk actions
  const selectedContactsRef = useRef<Contact[]>([]);

  // tRPC utils for query invalidation
  const utils = api.useUtils();

  // Dynamic filter options - updates based on current filter state
  const { statusOptions, departmentOptions, accountOptions, isLoading: filtersLoading } =
    useContactFilterOptions({
      search: debouncedSearch || undefined,
      status: statusFilter ? [statusFilter as (typeof CONTACT_STATUSES)[number]] : undefined,
      accountId: companyFilter && isValidUUID(companyFilter) ? companyFilter : undefined,
      department: departmentFilter || undefined,
    });

  // Clear filter values when their options become unavailable
  useEffect(() => {
    if (statusFilter && statusOptions.length > 0 && !statusOptions.some((o: FilterOption) => o.value === statusFilter)) {
      setStatusFilter('');
    }
  }, [statusOptions, statusFilter]);

  useEffect(() => {
    if (departmentFilter && departmentOptions.length > 0 && !departmentOptions.some((o: FilterOption) => o.value === departmentFilter)) {
      setDepartmentFilter('');
    }
  }, [departmentOptions, departmentFilter]);

  useEffect(() => {
    if (companyFilter && accountOptions.length > 0 && !accountOptions.some((o: FilterOption) => o.value === companyFilter)) {
      setCompanyFilter('');
    }
  }, [accountOptions, companyFilter]);

  // Build query parameters
  const sortParams = getSortParams(sortOrder);

  // Main data query
  const {
    data,
    isLoading,
    error,
    refetch,
  } = api.contact.list.useQuery({
    page: currentPage,
    limit: pageSize,
    search: debouncedSearch || undefined,
    department: departmentFilter || undefined,
    status: statusFilter ? [statusFilter as (typeof CONTACT_STATUSES)[number]] : undefined,
    accountId: companyFilter && isValidUUID(companyFilter) ? companyFilter : undefined,
    sortBy: sortParams.sortBy,
    sortOrder: sortParams.sortOrder,
  });

  // tRPC mutations with query invalidation
  const bulkEmailMutation = api.contact.bulkEmail.useMutation();
  const bulkExportMutation = api.contact.bulkExport.useMutation();
  const bulkDeleteMutation = api.contact.bulkDelete.useMutation({
    onSuccess: () => {
      utils.contact.list.invalidate();
      utils.contact.stats.invalidate();
    },
  });

  // Single contact delete mutation
  const deleteMutation = api.contact.delete.useMutation({
    onSuccess: () => {
      utils.contact.list.invalidate();
      utils.contact.stats.invalidate();
      toast({
        title: 'Contact Deleted',
        description: 'The contact has been successfully deleted.',
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, departmentFilter, statusFilter, companyFilter, sortOrder]);

  // Extract contacts from API response
  const contacts = useMemo(() => {
    if (!data?.contacts) return [];
    return data.contacts as Contact[];
  }, [data]);

  const totalItems = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  // Row action handlers
  const rowActionHandlers: RowActionHandlers = useMemo(
    () => ({
      onEdit: (contact) => router.push(`/contacts/${contact.id}/edit`),
      onCreateDeal: (contact) => router.push(`/deals/new?contactId=${contact.id}`),
      onCreateTicket: (contact) => router.push(`/tickets/new?contactId=${contact.id}`),
      onScheduleMeeting: (contact) => router.push(`/calendar/new?contactId=${contact.id}`),
      onDelete: (contact) => deleteMutation.mutate({ id: contact.id }),
    }),
    [router, deleteMutation]
  );

  // Create columns with row handlers
  const columns = useMemo(
    () => createColumns(rowActionHandlers),
    [rowActionHandlers]
  );

  const handleRowClick = (contact: Contact) => {
    router.push(`/contacts/${contact.id}`);
  };

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleBulkEmail = useCallback(
    async (selectedContacts: Contact[]) => {
      try {
        const result = await bulkEmailMutation.mutateAsync({
          ids: selectedContacts.map((c) => c.id),
        });

        if (result.mailtoUrl) {
          window.open(result.mailtoUrl, '_blank');
          toast({
            title: 'Email Client Opened',
            description: `Composing email to ${result.emails.length} contact(s).`,
          });
        } else {
          toast({
            title: 'No emails found',
            description: 'Could not find email addresses for selected contacts.',
            variant: 'destructive',
          });
        }
      } catch (err) {
        toast({
          title: 'Email Failed',
          description: err instanceof Error ? err.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
    },
    [bulkEmailMutation]
  );

  const handleBulkExport = useCallback(
    async (selectedContacts: Contact[]) => {
      try {
        const result = await bulkExportMutation.mutateAsync({
          ids: selectedContacts.map((c) => c.id),
          format: 'csv',
        });

        // Create and download the CSV file
        const blob = new Blob([result.data as string], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: 'Export Complete',
          description: `Successfully exported ${result.count} contact(s) to CSV.`,
        });
      } catch (err) {
        toast({
          title: 'Export Failed',
          description: err instanceof Error ? err.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
    },
    [bulkExportMutation]
  );

  const handleBulkDelete = useCallback(async () => {
    const selectedContacts = selectedContactsRef.current;
    if (selectedContacts.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkDeleteMutation.mutateAsync({
        ids: selectedContacts.map((c) => c.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Contacts Deleted',
          description: `Successfully deleted ${result.successful.length} contact(s).`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some contacts could not be deleted',
          description: `${result.failed.length} contact(s) failed: ${result.failed[0]?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowDeleteDialog(false);
    }
  }, [bulkDeleteMutation]);

  // Bulk actions for selected contacts
  const bulkActions: BulkAction<Contact>[] = useMemo(
    () => [
      {
        icon: 'mail',
        label: 'Send Email',
        onClick: (selected) => {
          handleBulkEmail(selected);
        },
      },
      {
        icon: 'file_export',
        label: 'Export',
        onClick: (selected) => {
          handleBulkExport(selected);
        },
      },
      {
        icon: 'delete',
        label: 'Delete',
        variant: 'danger',
        onClick: (selected) => {
          selectedContactsRef.current = selected;
          setShowDeleteDialog(true);
        },
      },
    ],
    [handleBulkEmail, handleBulkExport]
  );

  // Determine empty state message
  const hasFilters = debouncedSearch || departmentFilter || statusFilter || companyFilter;
  const emptyMessage = hasFilters
    ? 'No contacts match your search criteria'
    : 'No contacts found. Create your first contact to get started.';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Contacts' },
        ]}
        title="Contact List"
        description={`View and manage your customer database efficiently.${totalItems > 0 ? ` (${totalItems} total)` : ''}`}
        actions={[
          {
            label: 'New Contact',
            icon: 'add',
            variant: 'primary',
            href: '/contacts/new',
          },
        ]}
      />

      {/* Search and Filters */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search contacts by name, email, or company..."
        searchAriaLabel="Search contacts"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'toggle_on',
            options: statusOptions,
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            id: 'company',
            label: 'Company',
            icon: 'domain',
            options: accountOptions,
            value: companyFilter,
            onChange: setCompanyFilter,
          },
          {
            id: 'department',
            label: 'Department',
            icon: 'work',
            options: departmentOptions,
            value: departmentFilter,
            onChange: setDepartmentFilter,
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
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="material-symbols-outlined text-5xl text-destructive mb-4" aria-hidden="true">error</span>
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
            Failed to load contacts
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center max-w-md">
            {error.message || 'An unexpected error occurred while fetching contacts.'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">refresh</span>
            Try Again
          </button>
        </div>
      )}

      {/* Data Table - only show when not loading and no error */}
      {!isLoading && !error && (
        <DataTable
          columns={columns}
          data={contacts}
          emptyMessage={emptyMessage}
          emptyIcon="person_off"
          onRowClick={handleRowClick}
          enableRowSelection
          bulkActions={bulkActions}
          pageSize={pageSize}
          hidePagination
        />
      )}

      {/* Pagination - uses shared component, auto-hides when only 1 page */}
      {!isLoading && !error && (
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(totalItems / pageSize)}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          showSummary
          showNavLabels
          hideWhenSinglePage
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Contacts"
        description={`Are you sure you want to delete ${selectedContactsRef.current.length} selected contact(s)? This action cannot be undone. Contacts converted from leads cannot be deleted.`}
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
 * Contact Avatar Component
 * Shows initials with color based on name
 */
function ContactAvatar({ name, initials }: Readonly<{ name: string; initials: string }>) {
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
      className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(name)}`}
      aria-label={`Avatar for ${name}`}
    >
      {initials}
    </span>
  );
}

/**
 * Activity Badge Component
 * Shows opportunities and tasks count from API response
 */
function ActivityBadge({ contact }: Readonly<{ contact: Contact }>) {
  const opportunities = contact._count?.opportunities ?? 0;
  const tasks = contact._count?.tasks ?? 0;

  if (opportunities === 0 && tasks === 0) {
    return <span className="text-sm text-muted-foreground italic">No activity</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {opportunities > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-sm">handshake</span>
          {opportunities} {opportunities === 1 ? 'Deal' : 'Deals'}
        </span>
      )}
      {tasks > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="material-symbols-outlined text-sm">task_alt</span>
          {tasks} {tasks === 1 ? 'Task' : 'Tasks'}
        </span>
      )}
    </div>
  );
}
