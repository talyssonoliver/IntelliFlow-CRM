'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Skeleton,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useNotificationSubscription } from './hooks/useNotificationSubscription';
import { formatRelativeTime, getTypeConfig } from './notification-utils';
import { revalidateNotifications } from '@/app/notifications/actions';

function NotificationBellSkeleton() {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-700">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Header bell icon with unread count badge and dropdown preview.
 *
 * Uses useAuth (non-redirecting) — renders even without auth context.
 * Subscription invalidates getUnreadCount on new notifications.
 * Fallback: refetchInterval 60s when WebSocket is unavailable.
 */
export function NotificationBell() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const prevIsOpenRef = useRef(false);

  // Unread count with polling fallback
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  // Unread notifications — lazy-loaded on dropdown open
  const { data: recentData, isLoading } = trpc.notifications.list.useQuery(
    { limit: 5, isRead: false },
    { enabled: isAuthenticated && isOpen }
  );

  // Invalidate notification list on every popover open so cached data shows
  // instantly while a background refetch brings in fresh results.
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current && isAuthenticated) {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, isAuthenticated, utils]);

  // Real-time subscription invalidation
  const handleNewNotification = useCallback(() => {
    utils.notifications.getUnreadCount.invalidate();
    utils.notifications.list.invalidate();
  }, [utils]);

  useNotificationSubscription({
    enabled: isAuthenticated,
    onData: handleNewNotification,
  });

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.list.invalidate();
      if (user?.id) {
        revalidateNotifications(user.id);
      }
    },
  });

  // Track IDs optimistically marked as read in this dropdown session
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(new Set());

  const handleNotificationClick = useCallback(
    (n: { id: string; isRead: boolean; actionUrl?: string | null }) => {
      if (!n.isRead) {
        setOptimisticReadIds((prev) => new Set(prev).add(n.id));
        markAsReadMutation.mutate({ notificationIds: [n.id] });
      }
      setIsOpen(false);
      if (n.actionUrl) {
        router.push(n.actionUrl);
      }
    },
    [markAsReadMutation, router]
  );

  // Clear optimistic state when dropdown closes — server data will have caught up
  useEffect(() => {
    if (!isOpen && optimisticReadIds.size > 0) {
      setOptimisticReadIds(new Set());
    }
  }, [isOpen, optimisticReadIds.size]);

  // Apply optimistic read state to both count and notification items
  const serverUnread = unreadData?.total ?? 0;
  const unreadCount = Math.max(0, serverUnread - optimisticReadIds.size);
  const recentNotifications = (recentData?.notifications ?? []).map((n) =>
    optimisticReadIds.has(n.id) ? { ...n, isRead: true } : n
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <span
            className="material-symbols-outlined text-slate-600 dark:text-slate-400"
            aria-hidden="true"
          >
            notifications
          </span>
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white"
              aria-live="polite"
              aria-atomic="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
          {unreadCount > 0 && <span className="text-xs text-slate-500">{unreadCount} unread</span>}
        </div>
        <ScrollArea className="max-h-80">
          {(() => {
            if (isLoading) return <NotificationBellSkeleton />;
            if (recentNotifications.length === 0)
              return <EmptyState entity="notifications" phase="passive" className="py-2" />;
            return (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {recentNotifications.map((n) => {
                  const typeConfig = getTypeConfig(n.type);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${n.isRead ? '' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor}`}
                      >
                        <span className="material-symbols-outlined text-sm">{typeConfig.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${n.isRead ? 'font-medium' : 'font-semibold'} text-slate-900 dark:text-white line-clamp-2 break-words`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatRelativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.isRead && (
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </ScrollArea>
        <div className="border-t border-slate-200 dark:border-slate-700 p-2">
          <Link
            href="/notifications"
            className="block w-full rounded-md px-3 py-2 text-center text-sm font-medium text-primary hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
