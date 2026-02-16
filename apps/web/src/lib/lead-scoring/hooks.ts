'use client';

/**
 * Lead Scoring Dashboard Hook (PG-148)
 *
 * Wraps the intelligence.getLeadScoringDashboard tRPC procedure.
 */

import { api } from '@/lib/api';
import type { LeadScoringDashboardData } from './types';

export interface LeadScoringFilters {
  dateRange: '7d' | '30d' | '90d';
  page: number;
  limit: number;
}

export function useLeadScoringDashboard(filters: LeadScoringFilters) {
  const query = api.intelligence.getLeadScoringDashboard.useQuery({
    dateRange: filters.dateRange,
    page: filters.page,
    limit: filters.limit,
  });

  const data = query.data as LeadScoringDashboardData | undefined;

  return {
    stats: data?.stats ?? null,
    scoredLeads: data?.scoredLeads ?? [],
    trends: data?.trends ?? [],
    distribution: data?.distribution ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
