'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, Pagination, Skeleton } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import {
  createAccountColumns,
  type AccountRow,
  type AccountRowHandlers,
} from '@/components/accounts/AccountCard';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useAccountFilterOptions } from '@/hooks/use-dynamic-filters';
import { invalidateAccountsCache } from './actions';

/**
 * Accounts List Client Island
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
// Constants
// =============================================================================

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'revenue-desc', label: 'Revenue High-Low' },
  { value: 'revenue-asc', label: 'Revenue Low-High' },
];

function getSortParams(sortOrder: string): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'name':
      return { sortBy: 'name', sortOrder: 'asc' };
    case 'revenue-desc':
      return { sortBy: 'revenue', sortOrder: 'desc' };
    case 'revenue-asc':
      return { sortBy: 'revenue', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

// =============================================================================
// Stat Cards
// =============================================================================

function formatCompactValue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

interface StatCardProps {
  title: string;
  value: string;
  detail?: string;
  isLoading?: boolean;
}

function StatCard({ title, value, detail, isLoading }: Readonly<StatCardProps>) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  );
}

// =============================================================================
// Accounts Content Sub-Component
// =============================================================================

interface AccountsContentProps {
  isLoading: boolean;
  accounts: AccountRow[];
  columns: ReturnType<typeof createAccountColumns>;
  handleRowClick: (row: AccountRow) => void;
  pageSize: number;
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  hasFilters: boolean;
}

function AccountsContent({
  isLoading,
  accounts,
  columns,
  handleRowClick,
  pageSize,
  currentPage,
  totalItems,
  onPageChange,
  hasFilters,
}: Readonly<AccountsContentProps>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" /> // NOSONAR typescript:S6479
        ))}
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="material-symbols-outlined text-5xl text-muted-foreground mb-3">
          domain
        </span>
        <h3 className="text-lg font-semibold text-foreground mb-1">No accounts found</h3>
        <p className="text-muted-foreground text-sm">
          {hasFilters
            ? 'Try adjusting your search or filters.'
            : 'Create your first account to get started.'}
        </p>
      </div>
    );
  }
  return (
    <>
      <DataTable
        columns={columns}
        data={accounts}
        onRowClick={handleRowClick}
        hidePagination
        pageSize={pageSize}
        emptyMessage="No accounts found."
        emptyIcon="domain"
      />
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalItems / pageSize)}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={onPageChange}
        showSummary
        showNavLabels
        hideWhenSinglePage
      />
    </>
  );
}

// =============================================================================
// Page Component
// =============================================================================

interface AccountsPageClientProps {
  initialStats?: unknown;
}

export default function AccountsPageClient({
  initialStats: serverStats,
}: AccountsPageClientProps = {}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = api.useUtils();

  const deleteMutation = api.account.delete.useMutation({
    onSuccess: () => {
      utils.account.list.invalidate();
      utils.account.stats.invalidate();
      invalidateAccountsCache();
    },
  });

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Dynamic filter options
  const { industryOptions, ownerOptions } = useAccountFilterOptions({
    search: debouncedSearch || undefined,
    industry: industryFilter || undefined,
    ownerId: ownerFilter || undefined,
  });

  // Stats query — hydrated with server-prefetched data when available
  const { data: stats, isLoading: statsLoading } = api.account.stats.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(serverStats == null ? {} : { initialData: serverStats as any }),
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, industryFilter, ownerFilter, sortOrder]);

  const sortParams = getSortParams(sortOrder);

  const { data, isLoading, error, refetch } = api.account.list.useQuery(
    {
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch || undefined,
      industry: industryFilter || undefined,
      ownerId: ownerFilter || undefined,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
    },
    { enabled: isAuthenticated && !authLoading }
  );

  const accounts = (data?.accounts ?? []) as AccountRow[];
  const totalItems = data?.total ?? 0;

  const handlers: AccountRowHandlers = useMemo(
    () => ({
      onView: (id) => router.push(`/accounts/${id}`),
      onEdit: (id) => router.push(`/accounts/${id}?edit=true`),
      onCreateDeal: (id) => router.push(`/deals/new?accountId=${id}`),
      onDelete: (id) => deleteMutation.mutate({ id }),
    }),
    [router, deleteMutation]
  );

  const columns = useMemo(() => createAccountColumns(handlers), [handlers]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleRowClick = useCallback(
    (row: AccountRow) => {
      router.push(`/accounts/${row.id}`);
    },
    [router]
  );

  // Stat calculations
  const totalRevenue = stats ? Number(stats.totalRevenue) : 0;
  const avgRevenue = stats && stats.total > 0 ? totalRevenue / stats.total : 0;
  const withOpportunities = (stats as Record<string, unknown>)?.withOpportunities as
    | number
    | undefined;
  const oppShare =
    stats && stats.total > 0 && withOpportunities != null
      ? Math.round((withOpportunities / stats.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Accounts' }]}
        title="Account List Overview"
        description="Manage corporate hierarchies and account relationships"
        actions={[
          {
            label: 'New Account',
            icon: 'add',
            variant: 'primary',
            href: '/accounts/new',
          },
        ]}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Accounts"
          value={stats ? stats.total.toLocaleString('en-US') : '\u2014'}
          isLoading={statsLoading}
        />
        <StatCard
          title="Total Revenue"
          value={stats ? formatCompactValue(totalRevenue) : '\u2014'}
          isLoading={statsLoading}
        />
        <StatCard
          title="Average Revenue"
          value={stats ? formatCompactValue(avgRevenue) : '\u2014'}
          detail="avg/account"
          isLoading={statsLoading}
        />
        <StatCard
          title="With Opportunities"
          value={withOpportunities == null ? '\u2014' : withOpportunities.toLocaleString('en-US')}
          detail={oppShare > 0 ? `${oppShare}% share` : undefined}
          isLoading={statsLoading}
        />
      </div>

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={handleSearch}
        searchPlaceholder="Search by name, ID or hierarchy..."
        searchAriaLabel="Search accounts"
        filters={[
          {
            id: 'industry',
            label: 'Industry: All',
            icon: 'category',
            options: industryOptions,
            value: industryFilter,
            onChange: setIndustryFilter,
          },
          {
            id: 'owner',
            label: 'Owner: Everyone',
            icon: 'person',
            options: ownerOptions,
            value: ownerFilter,
            onChange: setOwnerFilter,
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span
            className="material-symbols-outlined text-5xl text-destructive mb-4"
            aria-hidden="true"
          >
            error
          </span>
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
            Failed to load accounts
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center max-w-md">
            {error.message || 'An unexpected error occurred while fetching accounts.'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              refresh
            </span>{' '}
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <AccountsContent
          isLoading={isLoading}
          accounts={accounts}
          columns={columns}
          handleRowClick={handleRowClick}
          pageSize={pageSize}
          currentPage={currentPage}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          hasFilters={!!(searchQuery || industryFilter || ownerFilter)}
        />
      )}
    </div>
  );
}
