/**
 * Dynamic Filter Options Hooks
 *
 * Generic hook factory for fetching dynamic filter options from API endpoints.
 * Uses DRY pattern - single implementation works for all entity types.
 *
 * Features:
 * - Hide filter options with 0 matching records
 * - Dynamic counts that update based on other active filters
 * - Consistent pattern across all entity list pages
 * - Type-safe with generic type parameters
 */

import { useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import type { FilterOption } from '@/components/shared';
import { formatLabel } from '@/lib/shared/filter-utils';

// =============================================================================
// Types
// =============================================================================

/** Raw filter option from API with count */
interface FilterOptionWithCount {
  value: string;
  label?: string;
  count: number;
}

/** Filter options response structure from API */
interface FilterOptionsResponse {
  statuses?: FilterOptionWithCount[];
  departments?: FilterOptionWithCount[];
  accounts?: FilterOptionWithCount[];
  sources?: FilterOptionWithCount[];
  priorities?: FilterOptionWithCount[];
  slaStatuses?: FilterOptionWithCount[];
  owners?: FilterOptionWithCount[];
}

/** Contact-specific filter state */
interface ContactFilterState {
  search?: string;
  status?: string[];
  accountId?: string;
  department?: string;
}

/** Lead-specific filter state */
interface LeadFilterState {
  search?: string;
  status?: string[];
  source?: string[];
  ownerId?: string;
}

/** Ticket-specific filter state */
interface TicketFilterState {
  search?: string;
  status?: string;
  priority?: string;
  slaStatus?: string;
  assigneeId?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Transform filter options with counts to FilterOption format
 * Appends count to label: "Status (5)"
 */
function transformOptions(
  options: FilterOptionWithCount[] | undefined,
  labelFormatter: (value: string) => string = formatLabel
): FilterOption[] {
  if (!options) return [];
  return options.map((opt) => ({
    value: opt.value,
    label: `${opt.label || labelFormatter(opt.value)} (${opt.count})`,
  }));
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// Generic Filter Options Hook
// =============================================================================

interface UseFilterOptionsConfig {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}

const DEFAULT_CONFIG: UseFilterOptionsConfig = {
  staleTime: 5_000,
  refetchOnWindowFocus: false,
};

/**
 * Generic hook for transforming API filter options to UI format
 */
function useFilterOptionsTransform<T extends FilterOptionsResponse>(
  data: T | undefined,
  isLoading: boolean,
  error: unknown
) {
  const statusOptions = useMemo(
    () => transformOptions(data?.statuses, capitalizeWords),
    [data?.statuses]
  );

  const departmentOptions = useMemo(
    () => transformOptions(data?.departments, capitalizeWords),
    [data?.departments]
  );

  const accountOptions = useMemo(
    () => transformOptions(data?.accounts),
    [data?.accounts]
  );

  const sourceOptions = useMemo(
    () => transformOptions(data?.sources, capitalizeWords),
    [data?.sources]
  );

  const priorityOptions = useMemo(
    () => transformOptions(data?.priorities, capitalizeWords),
    [data?.priorities]
  );

  const slaStatusOptions = useMemo(
    () => transformOptions(data?.slaStatuses, capitalizeWords),
    [data?.slaStatuses]
  );

  const ownerOptions = useMemo(
    () => transformOptions(data?.owners),
    [data?.owners]
  );

  return {
    statusOptions,
    departmentOptions,
    accountOptions,
    sourceOptions,
    priorityOptions,
    slaStatusOptions,
    ownerOptions,
    isLoading,
    error,
  };
}

// =============================================================================
// Entity-Specific Hooks
// =============================================================================

/**
 * Hook to fetch dynamic filter options for contacts
 */
export function useContactFilterOptions(
  currentFilters?: ContactFilterState,
  config: UseFilterOptionsConfig = DEFAULT_CONFIG
) {
  // UI filter state uses string[] for flexibility, but tRPC expects enum arrays.
  // Values are validated at the API layer, making these casts safe at runtime.
  const queryInput = currentFilters
    ? {
        search: currentFilters.search || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string[] to tRPC enum[] boundary
        status: currentFilters.status?.length ? (currentFilters.status as any) : undefined,
        accountId: currentFilters.accountId || undefined,
        department: currentFilters.department || undefined,
      }
    : undefined;

  const { data, isLoading, error } = api.contact.filterOptions.useQuery(queryInput, {
    staleTime: config.staleTime,
    refetchOnWindowFocus: config.refetchOnWindowFocus,
  });

  return useFilterOptionsTransform(data, isLoading, error);
}

/**
 * Hook to fetch dynamic filter options for leads
 */
export function useLeadFilterOptions(
  currentFilters?: LeadFilterState,
  config: UseFilterOptionsConfig = DEFAULT_CONFIG
) {
  // UI filter state uses string[] for flexibility, but tRPC expects enum arrays.
  // Values are validated at the API layer, making these casts safe at runtime.
  const queryInput = currentFilters
    ? {
        search: currentFilters.search || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string[] to tRPC enum[] boundary
        status: currentFilters.status?.length ? (currentFilters.status as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string[] to tRPC enum[] boundary
        source: currentFilters.source?.length ? (currentFilters.source as any) : undefined,
        ownerId: currentFilters.ownerId || undefined,
      }
    : undefined;

  const { data, isLoading, error } = api.lead.filterOptions.useQuery(queryInput, {
    staleTime: config.staleTime,
    refetchOnWindowFocus: config.refetchOnWindowFocus,
  });

  const statusOptions = useMemo(
    () => transformOptions(data?.statuses, capitalizeWords),
    [data?.statuses]
  );

  const sourceOptions = useMemo(
    () => transformOptions(data?.sources, capitalizeWords),
    [data?.sources]
  );

  const ownerOptions = useMemo(() => transformOptions(data?.owners), [data?.owners]);

  return {
    statusOptions,
    sourceOptions,
    ownerOptions,
    isLoading,
    error,
  };
}

/**
 * Hook to fetch dynamic filter options for tickets
 */
export function useTicketFilterOptions(
  currentFilters?: TicketFilterState,
  config: UseFilterOptionsConfig = DEFAULT_CONFIG
) {
  // UI filter state uses string for flexibility, but tRPC expects enum types.
  // Values are validated at the API layer, making these casts safe at runtime.
  const queryInput = currentFilters
    ? {
        search: currentFilters.search || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string to tRPC enum boundary
        status: currentFilters.status ? (currentFilters.status as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string to tRPC enum boundary
        priority: currentFilters.priority ? (currentFilters.priority as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UI string to tRPC enum boundary
        slaStatus: currentFilters.slaStatus ? (currentFilters.slaStatus as any) : undefined,
        assigneeId: currentFilters.assigneeId || undefined,
      }
    : undefined;

  const { data, isLoading, error } = api.ticket.filterOptions.useQuery(queryInput, {
    staleTime: config.staleTime,
    refetchOnWindowFocus: config.refetchOnWindowFocus,
  });

  const statusOptions = useMemo(
    () => transformOptions(data?.statuses, capitalizeWords),
    [data?.statuses]
  );

  const priorityOptions = useMemo(
    () => transformOptions(data?.priorities, capitalizeWords),
    [data?.priorities]
  );

  const slaStatusOptions = useMemo(
    () => transformOptions(data?.slaStatuses, capitalizeWords),
    [data?.slaStatuses]
  );

  return {
    statusOptions,
    priorityOptions,
    slaStatusOptions,
    isLoading,
    error,
  };
}

// =============================================================================
// Utility Hook for Clearing Invalid Filters
// =============================================================================

/**
 * Hook that returns a callback to check if a filter value is still valid
 * given the current options. Useful for clearing filters when options change.
 */
export function useFilterValidation(options: FilterOption[]) {
  return useCallback(
    (currentValue: string): boolean => {
      if (!currentValue) return true;
      if (options.length === 0) return true; // Don't invalidate while loading
      return options.some((opt) => opt.value === currentValue);
    },
    [options]
  );
}
