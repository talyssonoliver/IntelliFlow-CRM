'use client';

/**
 * AI Search Hook (PG-144)
 *
 * Wraps the intelligence.ragSearch tRPC procedure.
 */

import { api } from '@/lib/api';
import type { AISearchFilters, AISearchResponse } from './types';

export function useAISearch(filters: AISearchFilters) {
  const hasQuery = filters.query.trim().length > 0;

  const query = api.intelligence.ragSearch.useQuery(
    {
      query: filters.query,
      sources: filters.sources,
      searchType: filters.searchType,
      minRelevance: filters.minRelevance,
      dateRange: filters.dateRange,
      limit: filters.limit,
      offset: filters.offset,
    },
    { enabled: hasQuery }
  );

  const data = query.data as AISearchResponse | undefined;

  return {
    results: data?.results ?? [],
    totalResults: data?.totalResults ?? 0,
    avgRelevance: data?.avgRelevance ?? 0,
    executionTimeMs: data?.executionTimeMs ?? 0,
    sourceCounts: data?.sourceCounts ?? {},
    isLoading: query.isLoading && hasQuery,
    error: query.error,
    refetch: query.refetch,
  };
}
