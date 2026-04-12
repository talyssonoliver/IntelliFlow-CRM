'use client';

/**
 * Churn Risk Dashboard Hook (PG-143)
 *
 * Wraps the intelligence.getChurnDashboard tRPC procedure.
 */

import { api } from '@/lib/api';
import type { ChurnDashboardData } from './types';

export interface ChurnFilters {
  entityType: 'all' | 'lead' | 'contact';
  dateRange: '7d' | '30d' | '90d';
  page: number;
  limit: number;
}

export function useChurnDashboard(filters: ChurnFilters) {
  const query = api.intelligence.getChurnDashboard.useQuery({
    entityType: filters.entityType,
    dateRange: filters.dateRange,
    page: filters.page,
    limit: filters.limit,
  });

  const data = query.data as ChurnDashboardData | undefined;

  return {
    stats: data?.stats ?? null,
    atRiskCustomers: data?.atRiskCustomers ?? [],
    trends: data?.trends ?? [],
    distribution: data?.distribution ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
