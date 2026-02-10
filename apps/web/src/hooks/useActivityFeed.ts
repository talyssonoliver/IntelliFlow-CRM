'use client';

/**
 * Activity Feed Hook
 * IFC-069: Unified Activity Feed Service
 *
 * Provides cursor-based infinite scrolling via tRPC + React Query,
 * with real-time updates via tRPC WebSocket subscriptions (IFC-016).
 *
 * When a subscription event arrives (lead scored, task assigned, system event),
 * the feed query cache is invalidated so React Query refetches fresh data.
 * A 60s stale fallback poll is kept as safety net for missed events.
 */

import { useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import {
  useLeadScoredSubscription,
  useTaskAssignedSubscription,
  useSystemEventSubscription,
} from '@/hooks/use-trpc-subscriptions';
import type {
  ActivityFeedType,
  ActivityFeedSource,
  ActivityFeedEntityType,
} from '@intelliflow/domain';

export interface UseActivityFeedOptions {
  limit?: number;
  types?: ActivityFeedType[];
  sources?: ActivityFeedSource[];
  entityType?: ActivityFeedEntityType;
  entityId?: string;
  after?: Date;
  before?: Date;
  enabled?: boolean;
}

export function useActivityFeed(options: UseActivityFeedOptions = {}) {
  const {
    limit = 20,
    types,
    sources,
    entityType,
    entityId,
    after,
    before,
    enabled = true,
  } = options;

  const utils = trpc.useUtils();

  // Debounce invalidation to avoid rapid-fire refetches when multiple
  // subscription events arrive in a short window (e.g. batch scoring).
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateFeed = useCallback(() => {
    if (invalidateTimer.current) return; // already scheduled
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      utils.activityFeed.getUnifiedFeed.invalidate();
    }, 500);
  }, [utils]);

  // ── Real-time subscriptions (IFC-016 infrastructure) ──────────────
  // Each subscription invalidates the feed cache on new events,
  // causing React Query to refetch the first page with fresh data.
  useLeadScoredSubscription({
    autoStart: enabled,
    onData: invalidateFeed,
  });

  useTaskAssignedSubscription({
    autoStart: enabled,
    onData: invalidateFeed,
  });

  useSystemEventSubscription({
    autoStart: enabled,
    onData: invalidateFeed,
  });

  const query = trpc.activityFeed.getUnifiedFeed.useInfiniteQuery(
    {
      limit,
      types,
      sources,
      entityType,
      entityId,
      after,
      before,
    },
    {
      enabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      // Fallback poll at 60s as safety net — primary updates come via WebSocket.
      refetchInterval: 60_000,
    },
  );

  // Flatten all pages into a single array of items
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export interface UseEntityFeedOptions {
  entityType: ActivityFeedEntityType;
  entityId: string;
  limit?: number;
  types?: ActivityFeedType[];
  enabled?: boolean;
}

export function useEntityFeed(options: UseEntityFeedOptions) {
  const { entityType, entityId, limit = 20, types, enabled = true } = options;

  const utils = trpc.useUtils();

  // Invalidate entity-specific feed on subscription events
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateFeed = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      utils.activityFeed.getEntityFeed.invalidate();
    }, 500);
  }, [utils]);

  useLeadScoredSubscription({
    autoStart: enabled && entityType === 'LEAD',
    onData: invalidateFeed,
  });

  useTaskAssignedSubscription({
    autoStart: enabled,
    onData: invalidateFeed,
  });

  useSystemEventSubscription({
    autoStart: enabled,
    onData: invalidateFeed,
  });

  const query = trpc.activityFeed.getEntityFeed.useInfiniteQuery(
    {
      entityType,
      entityId,
      limit,
      types,
    },
    {
      enabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      // Fallback poll at 60s — primary updates via WebSocket subscriptions.
      refetchInterval: 60_000,
    },
  );

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
