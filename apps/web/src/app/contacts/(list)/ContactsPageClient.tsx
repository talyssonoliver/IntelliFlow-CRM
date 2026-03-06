'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmationDialog, toast, Pagination } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, type FilterOption } from '@/components/shared';
import { ContactList, type ContactListProps } from '@/components/contacts';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { CONTACT_STATUSES } from '@intelliflow/domain';
import { useContactFilterOptions, isValidUUID } from '@/hooks/use-dynamic-filters';
import { invalidateContactsCache } from './actions';

/**
 * Contacts List Client Island
 *
 * All interactive logic extracted from the original page.tsx.
 */

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

// =============================================================================
// Filter Options (Sort options only - status/department/account are dynamic)
// =============================================================================

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

// =============================================================================
// Page Component
// =============================================================================

interface ContactsPageClientProps {
  initialData?: unknown;
}

export default function ContactsPageClient({
  initialData: serverData,
}: ContactsPageClientProps = {}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Debounce search for 300ms to avoid excessive API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track selected contacts for bulk actions
  const selectedContactsRef = useRef<Array<{ id: string }>>([]);

  // tRPC utils for query invalidation
  const utils = api.useUtils();

  // Dynamic filter options - updates based on current filter state
  const { statusOptions, departmentOptions, accountOptions } = useContactFilterOptions({
    search: debouncedSearch || undefined,
    status: statusFilter ? [statusFilter as (typeof CONTACT_STATUSES)[number]] : undefined,
    accountId: companyFilter && isValidUUID(companyFilter) ? companyFilter : undefined,
    department: departmentFilter || undefined,
  });

  // Clear filter values when their options become unavailable
  useEffect(() => {
    if (
      statusFilter &&
      statusOptions.length > 0 &&
      !statusOptions.some((o: FilterOption) => o.value === statusFilter)
    ) {
      setStatusFilter('');
    }
  }, [statusOptions, statusFilter]);

  useEffect(() => {
    if (
      departmentFilter &&
      departmentOptions.length > 0 &&
      !departmentOptions.some((o: FilterOption) => o.value === departmentFilter)
    ) {
      setDepartmentFilter('');
    }
  }, [departmentOptions, departmentFilter]);

  useEffect(() => {
    if (
      companyFilter &&
      accountOptions.length > 0 &&
      !accountOptions.some((o: FilterOption) => o.value === companyFilter)
    ) {
      setCompanyFilter('');
    }
  }, [accountOptions, companyFilter]);

  // Build query parameters
  const sortParams = getSortParams(sortOrder);

  // Use server-prefetched data for initial render (page 1, no filters, newest sort)
  const isDefaultQuery =
    currentPage === 1 &&
    !debouncedSearch &&
    !departmentFilter &&
    !statusFilter &&
    !companyFilter &&
    sortOrder === 'newest';

  // Main data query - only run when authenticated
  const { data, isLoading, error, refetch } = api.contact.list.useQuery(
    {
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch || undefined,
      department: departmentFilter || undefined,
      status: statusFilter ? (statusFilter as (typeof CONTACT_STATUSES)[number]) : undefined,
      accountId: companyFilter && isValidUUID(companyFilter) ? companyFilter : undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
    },
    {
      enabled: isAuthenticated && !authLoading,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData: isDefaultQuery && serverData ? (serverData as any) : undefined,
    }
  );

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

  // tRPC mutations with query invalidation
  const bulkEmailMutation = api.contact.bulkEmail.useMutation();
  const bulkExportMutation = api.contact.bulkExport.useMutation();
  const bulkDeleteMutation = api.contact.bulkDelete.useMutation({
    onSuccess: () => {
      utils.contact.list.invalidate();
      utils.contact.stats.invalidate();
      invalidateContactsCache();
    },
  });

  // Single contact delete mutation
  const deleteMutation = api.contact.delete.useMutation({
    onSuccess: () => {
      utils.contact.list.invalidate();
      utils.contact.stats.invalidate();
      invalidateContactsCache();
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
  const contacts = data?.contacts ?? [];
  const totalItems = data?.total ?? 0;

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleBulkEmail = useCallback(
    async (ids: string[]) => {
      try {
        const result = await bulkEmailMutation.mutateAsync({ ids });

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
    async (ids: string[], format: 'csv' | 'json' = 'csv') => {
      try {
        const result = await bulkExportMutation.mutateAsync({
          ids,
          format,
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contacts' }]}
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

      {/* Redirecting State for Auth Errors */}
      {error && isAuthError && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8">
          <span
            className="material-symbols-outlined text-5xl text-slate-400 mb-4 animate-spin"
            aria-hidden="true"
          >
            progress_activity
          </span>
          <p className="text-slate-600 dark:text-slate-400">Redirecting to login...</p>
        </div>
      )}

      {/* Error State for Non-Auth Errors */}
      {error && !isAuthError && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span
            className="material-symbols-outlined text-5xl text-destructive mb-4"
            aria-hidden="true"
          >
            error
          </span>
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
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              refresh
            </span>
            Try Again
          </button>
        </div>
      )}

      {/* Contact List - handles loading skeleton, data table, and empty states */}
      {!error && (
        <ContactList
          contacts={contacts as ContactListProps['contacts']}
          total={totalItems}
          isLoading={isLoading}
          onRowClick={(contact) => router.push(`/contacts/${contact.id}`)}
          onEdit={(contact) => router.push(`/contacts/${contact.id}/edit`)}
          onDelete={(contact) => deleteMutation.mutate({ id: contact.id })}
          onCreateDeal={(contact) => router.push(`/deals/new?contactId=${contact.id}`)}
          onCreateTicket={(contact) => router.push(`/tickets/new?contactId=${contact.id}`)}
          onScheduleMeeting={(contact) => router.push(`/calendar/new?contactId=${contact.id}`)}
          onBulkEmail={handleBulkEmail}
          onBulkExport={handleBulkExport}
          onBulkDelete={(ids) => {
            selectedContactsRef.current = ids.map((id) => ({ id }));
            setShowDeleteDialog(true);
          }}
          pageSize={pageSize}
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
