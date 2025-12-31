/**
 * Reminders Context
 *
 * React context for the reminders service, providing global access to
 * reminder state and notifications across the application.
 *
 * Task: IFC-147 - Case Timeline UI with Deadline Engine
 */

'use client';

import * as React from 'react';
import {
  remindersService,
  type Reminder,
  type ReminderNotification,
} from './reminders-service';

// Re-export types for consumers
export type { Reminder, ReminderNotification } from './reminders-service';
import type { TimelineEvent } from '../../../lib/timeline/types';

// =============================================================================
// Types
// =============================================================================

interface RemindersContextValue {
  /** All pending reminders */
  pendingReminders: Reminder[];
  /** Count of pending reminders for notification badge */
  pendingCount: number;
  /** Recent notifications (last 10) */
  recentNotifications: ReminderNotification[];
  /** Unread notification count */
  unreadCount: number;
  /** Whether the service is running */
  isRunning: boolean;
  /** Start the reminders service */
  start: () => void;
  /** Stop the reminders service */
  stop: () => void;
  /** Create reminders from timeline events */
  createFromTimelineEvents: (events: TimelineEvent[]) => Reminder[];
  /** Snooze a reminder */
  snoozeReminder: (reminderId: string, minutes: number) => void;
  /** Dismiss a reminder */
  dismissReminder: (reminderId: string) => void;
  /** Mark all notifications as read */
  markAllAsRead: () => void;
  /** Mark a specific notification as read */
  markAsRead: (reminderId: string) => void;
}

// =============================================================================
// Context
// =============================================================================

const RemindersContext = React.createContext<RemindersContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface RemindersProviderProps {
  children: React.ReactNode;
  /** Auto-start the service on mount */
  autoStart?: boolean;
  /** Check interval in milliseconds (default: 60000) */
  checkInterval?: number;
}

export function RemindersProvider({
  children,
  autoStart = true,
  checkInterval = 60000,
}: RemindersProviderProps) {
  const [pendingReminders, setPendingReminders] = React.useState<Reminder[]>([]);
  const [recentNotifications, setRecentNotifications] = React.useState<ReminderNotification[]>([]);
  const [readNotifications, setReadNotifications] = React.useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = React.useState(false);

  // Sync pending reminders from service
  const syncReminders = React.useCallback(() => {
    setPendingReminders(remindersService.getPendingReminders());
  }, []);

  // Handle incoming notifications
  const handleNotification = React.useCallback((notification: ReminderNotification) => {
    setRecentNotifications((prev) => {
      const updated = [notification, ...prev.filter((n) => n.reminderId !== notification.reminderId)];
      return updated.slice(0, 10); // Keep last 10
    });
    syncReminders();
  }, [syncReminders]);

  // Start the service
  const start = React.useCallback(() => {
    if (!isRunning) {
      remindersService.start(checkInterval);
      setIsRunning(true);
    }
  }, [isRunning, checkInterval]);

  // Stop the service
  const stop = React.useCallback(() => {
    remindersService.stop();
    setIsRunning(false);
  }, []);

  // Create reminders from timeline events
  const createFromTimelineEvents = React.useCallback((events: TimelineEvent[]): Reminder[] => {
    // Transform TimelineEvent to the format expected by reminders service
    const transformedEvents = events.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.description,
      timestamp: event.timestamp,
      priority: event.priority || 'medium',
    }));

    const reminders = remindersService.createFromTimelineEvents(transformedEvents as Parameters<typeof remindersService.createFromTimelineEvents>[0]);
    syncReminders();
    return reminders;
  }, [syncReminders]);

  // Snooze a reminder
  const snoozeReminder = React.useCallback((reminderId: string, minutes: number) => {
    remindersService.snoozeReminder(reminderId, minutes);
    syncReminders();
  }, [syncReminders]);

  // Dismiss a reminder
  const dismissReminder = React.useCallback((reminderId: string) => {
    remindersService.dismissReminder(reminderId);
    setRecentNotifications((prev) => prev.filter((n) => n.reminderId !== reminderId));
    syncReminders();
  }, [syncReminders]);

  // Mark all as read
  const markAllAsRead = React.useCallback(() => {
    setReadNotifications(new Set(recentNotifications.map((n) => n.reminderId)));
  }, [recentNotifications]);

  // Mark specific notification as read
  const markAsRead = React.useCallback((reminderId: string) => {
    setReadNotifications((prev) => new Set([...prev, reminderId]));
  }, []);

  // Subscribe to notifications on mount
  React.useEffect(() => {
    const unsubscribe = remindersService.onNotification(handleNotification);

    if (autoStart) {
      remindersService.start(checkInterval);
      setIsRunning(true);
    }

    // Initial sync
    setPendingReminders(remindersService.getPendingReminders());

    return () => {
      unsubscribe();
      remindersService.stop();
      setIsRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Calculate unread count
  const unreadCount = React.useMemo(() => {
    return recentNotifications.filter((n) => !readNotifications.has(n.reminderId)).length;
  }, [recentNotifications, readNotifications]);

  const value = React.useMemo<RemindersContextValue>(
    () => ({
      pendingReminders,
      pendingCount: pendingReminders.length,
      recentNotifications,
      unreadCount,
      isRunning,
      start,
      stop,
      createFromTimelineEvents,
      snoozeReminder,
      dismissReminder,
      markAllAsRead,
      markAsRead,
    }),
    [
      pendingReminders,
      recentNotifications,
      unreadCount,
      isRunning,
      start,
      stop,
      createFromTimelineEvents,
      snoozeReminder,
      dismissReminder,
      markAllAsRead,
      markAsRead,
    ]
  );

  return (
    <RemindersContext.Provider value={value}>
      {children}
    </RemindersContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useReminders(): RemindersContextValue {
  const context = React.useContext(RemindersContext);

  if (!context) {
    throw new Error('useReminders must be used within a RemindersProvider');
  }

  return context;
}

/**
 * Hook that returns null if used outside provider (for optional usage)
 */
export function useRemindersOptional(): RemindersContextValue | null {
  return React.useContext(RemindersContext);
}
