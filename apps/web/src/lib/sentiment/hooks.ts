'use client';

/**
 * Sentiment Dashboard Hook (PG-142)
 *
 * Wraps the intelligence.getSentimentDashboard tRPC procedure.
 */

import { api } from '@/lib/api';
import type { SentimentDashboardData } from './types';

export interface SentimentFilters {
  entityType: 'all' | 'lead' | 'contact';
  dateRange: '7d' | '30d' | '90d';
  page: number;
  limit: number;
}

export function useSentimentDashboard(filters: SentimentFilters) {
  const query = api.intelligence.getSentimentDashboard.useQuery({
    entityType: filters.entityType,
    dateRange: filters.dateRange,
    page: filters.page,
    limit: filters.limit,
  });

  const data = query.data as SentimentDashboardData | undefined;

  return {
    stats: data?.stats ?? null,
    recentAnalyses: data?.recentAnalyses ?? [],
    trends: data?.trends ?? [],
    distribution: data?.distribution ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
