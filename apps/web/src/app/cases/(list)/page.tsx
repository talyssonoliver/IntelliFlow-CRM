'use client';

/**
 * Cases List Page — tRPC integration wrapper (PG-138)
 *
 * Thin wrapper that fetches data via tRPC and delegates rendering
 * to the CaseList extracted component. Uses shared PageHeader for
 * breadcrumbs, title, and action buttons.
 *
 * @implements AC-1 (List page loads real data from api.cases.list)
 * @implements AC-2 (Stats from api.cases.stats)
 * @implements AC-3 (Filters from api.cases.filterOptions)
 */

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Skeleton } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { CaseList } from '@/components/cases';
import type { CaseStats, CaseFilterOptions, CaseListItem } from '@/components/cases';
import { useCaseFilters } from '@/hooks/useCaseFilters';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';

const defaultStats: CaseStats = { open: 0, inProgress: 0, overdue: 0, closedThisMonth: 0 };
const defaultFilterOptions: CaseFilterOptions = { statuses: [], priorities: [] };

export default function CasesPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const { filters, queryParams, setSearch, setStatusFilter, setPriorityFilter, setSort, setPage } =
    useCaseFilters();

  // tRPC queries
  const { data, isLoading } = api.cases.list.useQuery(queryParams as never, {
    staleTime: 30_000,
  });
  // Stats and filter options are relatively static — cache aggressively
  const { data: rawStats } = api.cases.stats.useQuery(undefined, {
    staleTime: 5 * 60_000, // 5 min
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const { data: filterOptions } = api.cases.filterOptions.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const cases = useMemo(() => {
    if (!data) return [];
    return ((data as Record<string, unknown>).cases as CaseListItem[]) ?? [];
  }, [data]);

  const total = ((data as Record<string, unknown>)?.total as number) ?? 0;

  const stats: CaseStats = useMemo(() => {
    if (!rawStats) return defaultStats;
    const s = rawStats as Record<string, unknown>;
    const byStatus = (s.byStatus as Record<string, number>) ?? {};
    return {
      open: byStatus['OPEN'] ?? 0,
      inProgress: byStatus['IN_PROGRESS'] ?? 0,
      overdue: (s.overdue as number) ?? 0,
      closedThisMonth: (s.closedThisMonth as number) ?? 0,
    };
  }, [rawStats]);

  const handleRowClick = (caseItem: CaseListItem) => {
    router.push(`/cases/${caseItem.id}`);
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Cases' }]}
        title="Case Management"
        description="Manage and track all legal service cases across your organization"
        actions={[
          {
            label: 'Export',
            icon: 'file_download',
            variant: 'secondary',
            hideOnMobile: true,
          },
          {
            label: 'New Case',
            icon: 'add',
            variant: 'primary',
            href: '/cases/new',
          },
        ]}
      />
      <CaseList
        cases={cases}
        total={total}
        isLoading={isLoading}
        stats={stats}
        filterOptions={(filterOptions as CaseFilterOptions) ?? defaultFilterOptions}
        onRowClick={handleRowClick}
        pagination={{
          page: filters.page,
          limit: filters.limit,
          onPageChange: setPage,
        }}
        searchValue={filters.search}
        onSearchChange={setSearch}
        statusFilter={filters.status}
        onStatusChange={setStatusFilter}
        priorityFilter={filters.priority}
        onPriorityChange={setPriorityFilter}
        sortValue={filters.sort}
        onSortChange={setSort}
      />
    </>
  );
}
