'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { NotificationItem, NotificationItemSkeleton } from '@/components/notifications';

interface NotificationsSummaryWidgetProps {
  enabled: boolean;
}

export function NotificationsSummaryWidget({
  enabled,
}: Readonly<NotificationsSummaryWidgetProps>) {
  const utils = trpc.useUtils();

  const { data: unreadData, isLoading: countLoading } =
    trpc.notifications.getUnreadCount.useQuery(undefined, {
      enabled,
      refetchInterval: 60_000,
    });

  const { data: listData, isLoading: listLoading } =
    trpc.notifications.list.useQuery(
      { limit: 3, isRead: false },
      { enabled }
    );

  const invalidateAll = () => {
    utils.notifications.getUnreadCount.invalidate();
    utils.notifications.list.invalidate();
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: invalidateAll,
  });

  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: invalidateAll,
  });

  const unreadCount = unreadData?.total ?? 0;
  const notifications = listData?.notifications ?? [];
  const isLoading = countLoading || listLoading;

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate({ notificationIds: [id] });
  };

  const handleDismiss = () => {
    // no-op — dismiss not applicable in compact widget context
  };

  return (
    <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-slate-900 dark:text-white">Notifications</h2>
          {unreadCount > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white"
              aria-live="polite"
              aria-atomic="true"
            >
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead.mutate()}
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            aria-label="Mark all read"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {isLoading ? (
          <>
            <NotificationItemSkeleton />
            <NotificationItemSkeleton />
            <NotificationItemSkeleton />
          </>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            You&apos;re all caught up!
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkAsRead={handleMarkAsRead}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#e2e8f0] dark:border-[#334155] p-3">
        <Link
          href="/notifications"
          className="block w-full rounded-md px-3 py-2 text-center text-sm font-medium text-primary hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
