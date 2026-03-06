import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@intelliflow/ui';

import { getTypeConfig, getPriorityConfig, formatRelativeTime } from './notification-utils';

/** Accept tRPC-inferred notification type (Date fields from superjson) */
interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    priority: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string | Date;
    actionUrl?: string | null;
    actionLabel?: string | null;
  };
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export const NotificationItem = React.memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) {
  const router = useRouter();
  const typeConfig = getTypeConfig(notification.type);
  const priorityConfig = getPriorityConfig(notification.priority);

  const isAiType = notification.type.startsWith('ai_');
  const isUnread = !notification.isRead;
  const actionLink = notification.actionUrl;
  const unreadOrReadClass = isUnread
    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    : 'bg-slate-50/50 dark:bg-slate-800/50 border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700';
  const containerClass = isAiType
    ? 'bg-indigo-50/40 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/30 hover:border-indigo-200 dark:hover:border-indigo-700/50'
    : unreadOrReadClass;

  const activateItem = useCallback(() => {
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
    if (actionLink) {
      router.push(actionLink);
    }
  }, [isUnread, actionLink, notification.id, onMarkAsRead, router]);

  const handleItemClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't navigate if clicking on action buttons
      if ((e.target as HTMLElement).closest('button')) return;
      activateItem();
    },
    [activateItem]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateItem();
      }
    },
    [activateItem]
  );

  return (
    <div
      onClick={handleItemClick}
      onKeyDown={handleKeyDown}
      role={actionLink ? 'link' : undefined}
      tabIndex={actionLink ? 0 : undefined}
      className={`group relative flex w-full items-start gap-4 rounded-xl p-4 shadow-sm border transition-all hover:shadow-md ${actionLink ? 'cursor-pointer' : ''} ${containerClass}`}
    >
      {/* Priority Indicator */}
      {priorityConfig && (
        <div
          className={`absolute left-0 top-3 bottom-3 w-1 ${priorityConfig.borderColor} rounded-r-lg`}
        />
      )}

      {/* Icon */}
      <div
        className={`ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor} ring-1 ${typeConfig.ringColor}`}
      >
        <span className="material-symbols-outlined">{typeConfig.icon}</span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3
              className={`text-sm ${isUnread ? 'font-bold' : 'font-medium'} text-slate-900 dark:text-white`}
            >
              {notification.title}
            </h3>
            {notification.priority === 'high' && priorityConfig && (
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${priorityConfig.badgeBg} ${priorityConfig.badgeText} ${priorityConfig.badgeRing}`}
              >
                {priorityConfig.label}
              </span>
            )}
            {isUnread && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p
          className={`text-sm ${isUnread ? 'text-slate-700 dark:text-slate-300' : 'text-slate-600 dark:text-slate-400'} line-clamp-2 pr-12`}
        >
          {notification.body}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor}`}
          >
            {typeConfig.group}
          </span>
          {actionLink && (
            <span className="text-xs text-primary flex items-center gap-1">
              View details
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </span>
          )}
        </div>
      </div>

      {/* Actions — visible on hover and focus-within */}
      <div
        className={`absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${isAiType ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'bg-white dark:bg-slate-800'} pl-2 backdrop-blur-sm`}
      >
        <TooltipProvider>
          {isUnread && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  aria-label="Mark as read"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Mark as read</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onDismiss(notification.id)}
                aria-label="Dismiss"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-500"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Dismiss</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
});
