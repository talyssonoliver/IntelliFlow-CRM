'use client';

/**
 * Activity Feed Stats Hook
 * IFC-202: Activity Feed Stats Endpoint
 *
 * Wraps the activityFeed.getStats tRPC query with sensible defaults.
 * Returns aggregate counts by type, source, and entity type
 * over a configurable time window.
 */

import { trpc } from '@/lib/trpc';
import type {
  ActivityFeedSource,
  ActivityFeedEntityType,
  ActivityFeedTimeWindow,
} from '@intelliflow/domain';

export interface UseActivityFeedStatsOptions {
  timeWindow?: ActivityFeedTimeWindow;
  sources?: ActivityFeedSource[];
  entityType?: ActivityFeedEntityType;
  enabled?: boolean;
}

export function useActivityFeedStats(options: UseActivityFeedStatsOptions = {}) {
  const { timeWindow = '7d', sources, entityType, enabled = true } = options;

  const query = trpc.activityFeed.getStats.useQuery(
    { timeWindow, sources, entityType },
    {
      enabled,
      // Stats are cached server-side for 60s, poll at 120s client-side
      refetchInterval: 120_000,
      staleTime: 60_000,
    }
  );

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
