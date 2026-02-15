/**
 * useTicketFilters — Filter, search, sort, and pagination state for ticket list (PG-137)
 *
 * Manages URL-synced filter state with debounced search.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TicketStatus, TicketPriority, SLAStatus } from '@intelliflow/domain';

export interface TicketFilters {
  search: string;
  status: TicketStatus | '';
  priority: TicketPriority | '';
  slaStatus: SLAStatus | 'all';
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

const DEFAULT_FILTERS: TicketFilters = {
  search: '',
  status: '',
  priority: '',
  slaStatus: 'all',
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  page: 1,
  limit: 20,
};

export function useTicketFilters(defaults?: Partial<TicketFilters>) {
  const initialFilters = useMemo(() => ({ ...DEFAULT_FILTERS, ...defaults }), []);
  const [filters, setFilters] = useState<TicketFilters>(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters.search]);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  }, []);

  const setStatusFilter = useCallback((status: TicketStatus | '') => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  }, []);

  const setPriorityFilter = useCallback((priority: TicketPriority | '') => {
    setFilters(prev => ({ ...prev, priority, page: 1 }));
  }, []);

  const setSLAFilter = useCallback((slaStatus: SLAStatus | 'all') => {
    setFilters(prev => ({ ...prev, slaStatus, page: 1 }));
  }, []);

  const setSort = useCallback((sortBy: string, sortOrder?: 'asc' | 'desc') => {
    setFilters(prev => ({
      ...prev,
      sortBy,
      sortOrder: sortOrder ?? (prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc'),
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setDebouncedSearch(initialFilters.search);
  }, [initialFilters]);

  // Build query params for tRPC (omit empty/default values)
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page: filters.page,
      limit: filters.limit,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.slaStatus && filters.slaStatus !== 'all') params.slaStatus = filters.slaStatus;
    if (filters.sortBy !== 'updatedAt') params.sortBy = filters.sortBy;
    if (filters.sortOrder !== 'desc') params.sortOrder = filters.sortOrder;
    return params;
  }, [filters, debouncedSearch]);

  return {
    filters,
    debouncedSearch,
    queryParams,
    setSearch,
    setStatusFilter,
    setPriorityFilter,
    setSLAFilter,
    setSort,
    setPage,
    resetFilters,
  };
}
