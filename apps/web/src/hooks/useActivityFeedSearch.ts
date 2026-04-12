'use client';

/**
 * Activity Feed Search Hook
 * IFC-203: Full-text search via activityFeed.search tRPC endpoint
 *
 * Provides server-side ILIKE search across 7 activity source tables
 * with cursor-based pagination, debounced to avoid excessive requests.
 */

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type {
  ActivityFeedType,
  ActivityFeedSource,
  ActivityFeedEntityType,
} from '@intelliflow/domain';

export interface UseActivityFeedSearchOptions {
  /** Search query string — must be non-empty to trigger search */
  query: string;
  limit?: number;
  types?: ActivityFeedType[];
  sources?: ActivityFeedSource[];
  entityType?: ActivityFeedEntityType;
  enabled?: boolean;
}

/** Minimum characters before triggering backend search */
const MIN_SEARCH_LENGTH = 2;

export function useActivityFeedSearch(options: UseActivityFeedSearchOptions) {
  const { query, limit = 20, types, sources, entityType, enabled = true } = options;

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length >= MIN_SEARCH_LENGTH && enabled;

  const searchQuery = trpc.activityFeed.search.useInfiniteQuery(
    {
      query: trimmedQuery,
      limit,
      types,
      sources,
      entityType,
    },
    {
      enabled: isSearchActive,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  );

  const items = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [searchQuery.data]
  );

  return {
    items,
    isLoading: searchQuery.isLoading && isSearchActive,
    isError: searchQuery.isError,
    error: searchQuery.error,
    isFetchingNextPage: searchQuery.isFetchingNextPage,
    hasNextPage: searchQuery.hasNextPage ?? false,
    fetchNextPage: searchQuery.fetchNextPage,
    refetch: searchQuery.refetch,
    isSearchActive,
  };
}
