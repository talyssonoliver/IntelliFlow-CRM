'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useRemindersOptional, type ReminderNotification } from '@/lib/cases/reminders-context';

interface NotificationsProps {
  count?: number;
  className?: string;
}

// Icon mapping for reminder types
const getReminderIcon = (notification: ReminderNotification): string => {
  const iconMap: Record<string, string> = {
    deadline: 'schedule',
    task: 'task_alt',
    appointment: 'event',
    follow_up: 'reply',
    custom: 'notifications',
  };
  // Extract type from title or use default
  if (notification.title.toLowerCase().includes('deadline')) return iconMap.deadline;
  if (notification.title.toLowerCase().includes('task')) return iconMap.task;
  if (notification.title.toLowerCase().includes('appointment')) return iconMap.appointment;
  return iconMap.custom;
};

// Priority color mapping
const getPriorityColor = (priority: string): string => {
  const colorMap: Record<string, string> = {
    low: 'text-muted-foreground',
    medium: 'text-primary',
    high: 'text-orange-500',
    urgent: 'text-destructive',
  };
  return colorMap[priority] || colorMap.medium;
};

export function Notifications({ count: propCount, className }: NotificationsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Get reminders from context (optional - works without provider)
  const reminders = useRemindersOptional();

  // Use context count if available, otherwise fall back to prop
  const count = reminders?.unreadCount ?? propCount ?? 0;
  const notifications = reminders?.recentNotifications ?? [];

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = () => {
    reminders?.markAllAsRead();
  };

  const handleDismiss = (reminderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    reminders?.dismissReminder(reminderId);
  };

  const handleSnooze = (reminderId: string, minutes: number, e: React.MouseEvent) => {
    e.stopPropagation();
    reminders?.snoozeReminder(reminderId, minutes);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
      >
        <span className="material-symbols-outlined text-xl">notifications</span>
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No new notifications
              </div>
            ) : (
              <div className="py-2">
                {notifications.map((notification) => (
                  <Link
                    key={notification.reminderId}
                    href={notification.entityLink}
                    className="block px-4 py-3 hover:bg-accent cursor-pointer"
                    onClick={() => {
                      reminders?.markAsRead(notification.reminderId);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        'material-symbols-outlined',
                        getPriorityColor(notification.priority)
                      )}>
                        {getReminderIcon(notification)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{notification.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className={cn(
                            'text-xs',
                            notification.timeUntilDue.includes('overdue')
                              ? 'text-destructive font-medium'
                              : 'text-muted-foreground'
                          )}>
                            {notification.timeUntilDue}
                          </p>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => handleSnooze(notification.reminderId, 30, e)}
                              className="text-xs text-primary hover:underline"
                              title="Snooze 30 min"
                            >
                              Snooze
                            </button>
                            <span className="text-muted-foreground">·</span>
                            <button
                              onClick={(e) => handleDismiss(notification.reminderId, e)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-border">
            <Link
              href="/notifications"
              className="text-sm text-primary hover:underline w-full text-center block"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
