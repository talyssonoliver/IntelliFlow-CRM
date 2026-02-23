'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useNotificationSubscription } from './hooks/useNotificationSubscription';
import { formatRelativeTime, getTypeConfig } from './notification-utils';

/**
 * Header bell icon with unread count badge and dropdown preview.
 *
 * Uses useAuth (non-redirecting) — renders even without auth context.
 * Subscription invalidates getUnreadCount on new notifications.
 * Fallback: refetchInterval 60s when WebSocket is unavailable.
 */
export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);

  // Unread count with polling fallback
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  // Recent notifications — lazy-loaded on dropdown open
  const { data: recentData } = trpc.notifications.list.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated && isOpen }
  );

  // Real-time subscription invalidation
  const handleNewNotification = useCallback(() => {
    utils.notifications.getUnreadCount.invalidate();
    utils.notifications.list.invalidate();
  }, [utils]);

  useNotificationSubscription({
    enabled: isAuthenticated,
    onData: handleNewNotification,
  });

  const unreadCount = unreadData?.total ?? 0;
  const recentNotifications = recentData?.notifications ?? [];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
            notifications
          </span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-slate-500">{unreadCount} unread</span>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {recentNotifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">No recent notifications</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentNotifications.map((n) => {
                const typeConfig = getTypeConfig(n.type);
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 ${!n.isRead ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor}`}
                    >
                      <span className="material-symbols-outlined text-sm">{typeConfig.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
