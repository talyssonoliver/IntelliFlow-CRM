import { useCallback, useMemo, useRef } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { useNotificationSubscription } from './useNotificationSubscription';
import type { NotificationFiltersState, NotificationType, NotificationPriority } from '../types';

/**
 * Hook that wraps trpc.notifications.list.useInfiniteQuery with subscription invalidation.
 *
 * Pattern follows useActivityFeed.ts:39-112:
 * - useInfiniteQuery with cursor-based pagination
 * - 500ms debounced cache invalidation on subscription events
 * - placeholderData: keepPreviousData to avoid flash on filter change
 */
export function useNotificationFeed(filters: NotificationFiltersState) {
  const utils = trpc.useUtils();

  // Build query input from filter state
  const queryInput = {
    limit: 20,
    ...(filters.searchQuery && { search: filters.searchQuery }),
    ...(filters.typeFilter && { types: [filters.typeFilter as NotificationType] }),
    ...(filters.priorityFilter && { priorities: [filters.priorityFilter as NotificationPriority] }),
    ...(filters.activeTab === 'unread' && { isRead: false }),
    ...(filters.activeTab === 'high' && { priorities: ['high' as NotificationPriority] }),
  };

  const query = trpc.notifications.list.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  // Debounced invalidation on subscription events (500ms)
  // Pattern from useActivityFeed.ts:56-62
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateFeed = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    }, 500);
  }, [utils]);

  // Subscribe to real-time notifications
  useNotificationSubscription({
    onData: invalidateFeed,
  });

  // Flatten pages into deduplicated items — cursor-based pagination can
  // produce overlapping entries when pages shift after mutations/invalidations.
  const items = useMemo(() => {
    const all = query.data?.pages.flatMap((page) => page.notifications) ?? [];
    const seen = new Set<string>();
    return all.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [query.data]);

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
