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

import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { NotificationList, NotificationFilters } from '@/components/notifications';
import { revalidateNotifications } from './actions';

/** Map URL ?filter= and ?priority= values to filter state */
function getInitialFilters(searchParams: URLSearchParams): {
  activeTab: string;
  typeFilter: string;
  priorityFilter: string;
} {
  const filter = searchParams.get('filter');
  const priority = searchParams.get('priority');

  let activeTab = 'all';
  let typeFilter = '';

  switch (filter) {
    case 'unread':
      activeTab = 'unread';
      break;
    case 'ai-insights':
      typeFilter = 'ai_insight';
      break;
    case 'mentions':
      typeFilter = 'team_mention';
      break;
    case 'sla-alerts':
      typeFilter = 'system_alert';
      break;
    case 'system':
      typeFilter = 'system_alert';
      break;
  }

  return { activeTab, typeFilter, priorityFilter: priority ?? '' };
}

export default function NotificationsPage() {
  const searchParams = useSearchParams();
  const initialFilters = getInitialFilters(searchParams);

  const { user } = useRequireAuth();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(initialFilters.typeFilter);
  const [priorityFilter, setPriorityFilter] = useState(initialFilters.priorityFilter);
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
      if (user?.id) {
        revalidateNotifications(user.id);
      }
    },
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      if (user?.id) {
        revalidateNotifications(user.id);
      }
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

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setPriorityFilter('');
    setActiveTab('all');
  }, []);

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

      <NotificationFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={totalUnread}
        highPriorityCount={highPriorityCount}
        onClearFilters={handleClearFilters}
      />

      <NotificationList
        filters={filters}
        onMarkAsRead={handleMarkAsRead}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
