'use client';

/**
 * Notifications Inbox Page — Thin Orchestrator
 *
 * Composes SearchFilterBar + NotificationList using shared page patterns.
 * Manages filter state, mutations, and URL query param mapping.
 *
 * Task: PG-130 — Notifications Inbox Page
 * Depends: IFC-183 — Notifications tRPC Router
 */

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader, SearchFilterBar, type FilterOption } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { NotificationList, getTypeFilterOptions } from '@/components/notifications';

const priorityOptions: FilterOption[] = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

/** Map URL ?filter= values to filter state */
function getInitialFilters(searchParams: URLSearchParams): {
  activeTab: string;
  typeFilter: string;
} {
  const filter = searchParams.get('filter');
  switch (filter) {
    case 'unread':
      return { activeTab: 'unread', typeFilter: '' };
    case 'ai-insights':
      return { activeTab: 'all', typeFilter: 'ai_insight' };
    case 'mentions':
      return { activeTab: 'all', typeFilter: 'team_mention' };
    case 'sla-alerts':
      return { activeTab: 'all', typeFilter: 'system_alert' };
    case 'system':
      return { activeTab: 'all', typeFilter: 'system_alert' };
    default:
      return { activeTab: 'all', typeFilter: '' };
  }
}

export default function NotificationsPage() {
  const searchParams = useSearchParams();
  const initialFilters = getInitialFilters(searchParams);

  useRequireAuth();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(initialFilters.typeFilter);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [activeTab, setActiveTab] = useState(initialFilters.activeTab);

  // Debounced search for server-side filtering
  const debouncedSearch = useDebounce(searchQuery, 350);

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Unread count for filter badges
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery();
  const totalUnread = unreadData?.total ?? 0;
  const highPriorityCount = unreadData?.byPriority?.high ?? 0;

  // Mutations with optimistic updates + cache invalidation
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  // Action handlers
  const handleMarkAsRead = useCallback(
    (id: string) => {
      markAsReadMutation.mutate({ notificationIds: [id] });
    },
    [markAsReadMutation]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      deleteMutation.mutate({ notificationIds: [id], permanent: false });
    },
    [deleteMutation]
  );

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsReadMutation.mutate();
  }, [markAllAsReadMutation]);

  // Memoize type options (static data)
  const typeOptions = useMemo(() => getTypeFilterOptions(), []);

  // Build filter chips with dynamic counts
  const filterChips = useMemo(
    () => ({
      options: [
        { id: 'all', label: 'All' },
        { id: 'unread', label: `Unread${totalUnread > 0 ? ` (${totalUnread})` : ''}` },
        {
          id: 'high',
          label: `High Priority${highPriorityCount > 0 ? ` (${highPriorityCount})` : ''}`,
          color: 'bg-red-500',
        },
      ],
      value: activeTab,
      onChange: setActiveTab,
    }),
    [activeTab, totalUnread, highPriorityCount]
  );

  // Build filter state object for child components
  const filters = {
    searchQuery: debouncedSearch,
    typeFilter,
    priorityFilter,
    activeTab,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]}
        title="Notifications"
        description="Stay updated with your latest alerts and activities."
        actions={[
          {
            label: 'Settings',
            icon: 'tune',
            variant: 'secondary',
            href: '/notifications/settings',
          },
          {
            label: 'Mark all as read',
            icon: 'done_all',
            variant: 'primary',
            onClick: handleMarkAllAsRead,
            disabled: totalUnread === 0 || markAllAsReadMutation.isPending,
          },
        ]}
      />

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search notifications..."
        filters={[
          {
            id: 'type',
            label: 'Type',
            icon: 'category',
            options: typeOptions,
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: priorityOptions,
            value: priorityFilter,
            onChange: setPriorityFilter,
          },
        ]}
        filterChips={filterChips}
      />

      <NotificationList
        filters={filters}
        onMarkAsRead={handleMarkAsRead}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
