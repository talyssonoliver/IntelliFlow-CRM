import { useEffect, useRef } from 'react';

import { NotificationItem } from './NotificationItem';
import { NotificationItemSkeleton } from './NotificationItemSkeleton';
import { useNotificationFeed } from './hooks/useNotificationFeed';
import type { NotificationFiltersState } from './types';

interface NotificationListProps {
  filters: NotificationFiltersState;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function NotificationList({ filters, onMarkAsRead, onDismiss }: NotificationListProps) {
  const { items, isLoading, isError, error, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useNotificationFeed(filters);

  // IntersectionObserver for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasActiveFilters =
    filters.searchQuery !== '' ||
    filters.typeFilter !== '' ||
    filters.priorityFilter !== '' ||
    filters.activeTab !== 'all';

  // Loading state
  if (isLoading) {
    return (
      <div id="notification-list" className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <NotificationItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div id="notification-list" className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <span className="material-symbols-outlined text-red-500">error</span>
        <div>
          <p className="font-medium text-red-700 dark:text-red-400">Failed to load notifications</p>
          <p className="text-sm text-red-600 dark:text-red-500">{error?.message}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div id="notification-list" className="flex flex-col items-center justify-center py-16 text-center">
        <span
          className="material-symbols-outlined text-slate-300 dark:text-slate-600 mb-4"
          style={{ fontSize: '64px' }}
        >
          notifications_off
        </span>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          No notifications
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {hasActiveFilters ? 'No notifications match your filters.' : "You're all caught up!"}
        </p>
      </div>
    );
  }

  return (
    <div id="notification-list" className="flex flex-col gap-3">
      {items.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
          onDismiss={onDismiss}
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Fetching next page indicator */}
      {isFetchingNextPage && (
        <div className="flex flex-col gap-3">
          <NotificationItemSkeleton />
          <NotificationItemSkeleton />
        </div>
      )}
    </div>
  );
}
