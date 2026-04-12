/**
 * Case filter state hook — PG-138
 *
 * Manages URL-synced filter state for the case list page.
 * Uses string values for status/priority to match SearchFilterBar interface.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';

export interface CaseFilters {
  search: string;
  status: string;
  priority: string;
  overdue: boolean;
  sort: string;
  page: number;
  limit: number;
}

const defaultFilters: CaseFilters = {
  search: '',
  status: '',
  priority: '',
  overdue: false,
  sort: 'updatedAt',
  page: 1,
  limit: 20,
};

export function useCaseFilters() {
  const [filters, setFilters] = useState<CaseFilters>(defaultFilters);

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setStatusFilter = useCallback((status: string) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  }, []);

  const setPriorityFilter = useCallback((priority: string) => {
    setFilters((prev) => ({ ...prev, priority, page: 1 }));
  }, []);

  const setOverdue = useCallback((overdue: boolean) => {
    setFilters((prev) => ({ ...prev, overdue, page: 1 }));
  }, []);

  const setSort = useCallback((sort: string) => {
    setFilters((prev) => ({ ...prev, sort }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const queryParams = useMemo(
    () => ({
      search: filters.search || undefined,
      status: filters.status ? [filters.status] : undefined,
      priority: filters.priority ? [filters.priority] : undefined,
      overdue: filters.overdue || undefined,
      page: filters.page,
      limit: filters.limit,
    }),
    [filters]
  );

  return {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setPriorityFilter,
    setOverdue,
    setSort,
    setPage,
  };
}
