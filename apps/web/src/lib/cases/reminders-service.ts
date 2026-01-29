/**
 * Reminders Service
 *
 * Client-side service for managing case/deal reminders and notifications.
 * Integrates with the deadline engine and notification system.
 *
 * Task: IFC-147 - Case Timeline UI with Deadline Engine
 */

import type { TimelineEvent, TimelinePriority } from '../../../lib/timeline/types';

// =============================================================================
// Types
// =============================================================================

export interface Reminder {
  id: string;
  type: 'deadline' | 'task' | 'appointment' | 'follow_up' | 'custom';
  title: string;
  description?: string;
  dueDate: Date;
  priority: TimelinePriority;
  entityType: 'case' | 'deal' | 'contact' | 'task' | 'appointment';
  entityId: string;
  status: 'pending' | 'sent' | 'dismissed' | 'snoozed';
  snoozeUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderConfig {
  /** Minutes before due date to send reminder */
  leadTime: number;
  /** Whether to send email notification */
  sendEmail: boolean;
  /** Whether to show in-app notification */
  showInApp: boolean;
  /** Whether to send push notification */
  sendPush: boolean;
}

export interface CreateReminderInput {
  type: Reminder['type'];
  title: string;
  description?: string;
  dueDate: Date;
  priority?: TimelinePriority;
  entityType: Reminder['entityType'];
  entityId: string;
  config?: Partial<ReminderConfig>;
}

export interface ReminderNotification {
  reminderId: string;
  title: string;
  message: string;
  priority: TimelinePriority;
  dueDate: Date;
  timeUntilDue: string;
  entityLink: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  leadTime: 60, // 1 hour before
  sendEmail: true,
  showInApp: true,
  sendPush: false,
};

const PRIORITY_LEAD_TIMES: Record<TimelinePriority, number> = {
  low: 30, // 30 minutes
  medium: 60, // 1 hour
  high: 120, // 2 hours
  urgent: 240, // 4 hours
};

// =============================================================================
// Reminders Service
// =============================================================================

class RemindersService {
  private reminders: Map<string, Reminder> = new Map();
  private notificationCallbacks: Set<(notification: ReminderNotification) => void> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the reminders service and start checking for due reminders
   */
  start(checkIntervalMs: number = 60000): void {
    if (this.checkInterval) {
      return; // Already running
    }

    this.checkInterval = setInterval(() => {
      this.checkDueReminders();
    }, checkIntervalMs);

    // Run immediately
    this.checkDueReminders();
  }

  /**
   * Stop the reminders service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Subscribe to reminder notifications
   */
  onNotification(callback: (notification: ReminderNotification) => void): () => void {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  /**
   * Create a new reminder
   */
  createReminder(input: CreateReminderInput): Reminder {
    const reminder: Reminder = {
      id: `reminder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: input.type,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      priority: input.priority || 'medium',
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reminders.set(reminder.id, reminder);
    return reminder;
  }

  /**
   * Create reminders from timeline events
   */
  createFromTimelineEvents(events: TimelineEvent[]): Reminder[] {
    const reminders: Reminder[] = [];

    for (const event of events) {
      if (this.shouldCreateReminder(event)) {
        const reminder = this.createReminder({
          type: this.mapEventTypeToReminderType(event.type),
          title: event.title,
          description: event.description || undefined,
          dueDate: event.timestamp,
          priority: event.priority || 'medium',
          entityType: this.mapEntityType(event.type),
          entityId: event.id,
        });
        reminders.push(reminder);
      }
    }

    return reminders;
  }

  /**
   * Get all pending reminders for an entity
   */
  getRemindersForEntity(entityType: string, entityId: string): Reminder[] {
    return Array.from(this.reminders.values()).filter(
      (r) => r.entityType === entityType && r.entityId === entityId && r.status === 'pending'
    );
  }

  /**
   * Get all pending reminders
   */
  getPendingReminders(): Reminder[] {
    return Array.from(this.reminders.values()).filter((r) => r.status === 'pending');
  }

  /**
   * Get overdue reminders
   */
  getOverdueReminders(): Reminder[] {
    const now = new Date();
    return Array.from(this.reminders.values()).filter(
      (r) => r.status === 'pending' && r.dueDate < now
    );
  }

  /**
   * Snooze a reminder
   */
  snoozeReminder(reminderId: string, snoozeMinutes: number): Reminder | null {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return null;

    const snoozeUntil = new Date();
    snoozeUntil.setMinutes(snoozeUntil.getMinutes() + snoozeMinutes);

    reminder.status = 'snoozed';
    reminder.snoozeUntil = snoozeUntil;
    reminder.updatedAt = new Date();

    return reminder;
  }

  /**
   * Dismiss a reminder
   */
  dismissReminder(reminderId: string): boolean {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return false;

    reminder.status = 'dismissed';
    reminder.updatedAt = new Date();
    return true;
  }

  /**
   * Mark reminder as sent
   */
  markAsSent(reminderId: string): boolean {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return false;

    reminder.status = 'sent';
    reminder.updatedAt = new Date();
    return true;
  }

  /**
   * Check for due reminders and trigger notifications
   */
  private checkDueReminders(): void {
    const now = new Date();

    for (const reminder of this.reminders.values()) {
      // Skip non-pending reminders
      if (reminder.status !== 'pending' && reminder.status !== 'snoozed') {
        continue;
      }

      // Check if snoozed reminder should be reactivated
      if (reminder.status === 'snoozed' && reminder.snoozeUntil && reminder.snoozeUntil <= now) {
        reminder.status = 'pending';
        reminder.snoozeUntil = undefined;
      }

      // Check if reminder is due
      const leadTime = PRIORITY_LEAD_TIMES[reminder.priority] || DEFAULT_REMINDER_CONFIG.leadTime;
      const reminderTime = new Date(reminder.dueDate);
      reminderTime.setMinutes(reminderTime.getMinutes() - leadTime);

      if (reminder.status === 'pending' && reminderTime <= now) {
        this.triggerNotification(reminder);
      }
    }
  }

  /**
   * Trigger notification for a reminder
   */
  private triggerNotification(reminder: Reminder): void {
    const notification: ReminderNotification = {
      reminderId: reminder.id,
      title: reminder.title,
      message: this.formatReminderMessage(reminder),
      priority: reminder.priority,
      dueDate: reminder.dueDate,
      timeUntilDue: this.formatTimeUntilDue(reminder.dueDate),
      entityLink: this.getEntityLink(reminder),
    };

    // Notify all subscribers
    for (const callback of this.notificationCallbacks) {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification callback:', error);
      }
    }

    // Mark as sent
    this.markAsSent(reminder.id);
  }

  /**
   * Format reminder message
   */
  private formatReminderMessage(reminder: Reminder): string {
    const timeStr = this.formatTimeUntilDue(reminder.dueDate);
    return `${reminder.title} is due ${timeStr}`;
  }

  /**
   * Format time until due
   */
  private formatTimeUntilDue(dueDate: Date): string {
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();

    if (diff < 0) {
      const overdue = Math.abs(diff);
      if (overdue < 60000) return 'overdue';
      if (overdue < 3600000) return `${Math.floor(overdue / 60000)} minutes overdue`;
      if (overdue < 86400000) return `${Math.floor(overdue / 3600000)} hours overdue`;
      return `${Math.floor(overdue / 86400000)} days overdue`;
    }

    if (diff < 60000) return 'in less than a minute';
    if (diff < 3600000) return `in ${Math.floor(diff / 60000)} minutes`;
    if (diff < 86400000) return `in ${Math.floor(diff / 3600000)} hours`;
    return `in ${Math.floor(diff / 86400000)} days`;
  }

  /**
   * Get entity link for reminder
   */
  private getEntityLink(reminder: Reminder): string {
    switch (reminder.entityType) {
      case 'case':
        return `/cases/${reminder.entityId}`;
      case 'deal':
        return `/deals/${reminder.entityId}`;
      case 'contact':
        return `/contacts/${reminder.entityId}`;
      case 'task':
        return `/tasks/${reminder.entityId}`;
      case 'appointment':
        return `/appointments/${reminder.entityId}`;
      default:
        return '#';
    }
  }

  /**
   * Determine if a timeline event should have a reminder
   */
  private shouldCreateReminder(event: TimelineEvent): boolean {
    // Create reminders for future tasks, deadlines, and appointments
    const now = new Date();
    if (event.timestamp <= now) return false;

    const reminderTypes = ['task', 'deadline', 'appointment'];
    return reminderTypes.includes(event.type);
  }

  /**
   * Map timeline event type to reminder type
   */
  private mapEventTypeToReminderType(eventType: string): Reminder['type'] {
    switch (eventType) {
      case 'task':
      case 'task_overdue':
        return 'task';
      case 'deadline':
        return 'deadline';
      case 'appointment':
        return 'appointment';
      default:
        return 'custom';
    }
  }

  /**
   * Map event type to entity type
   */
  private mapEntityType(eventType: string): Reminder['entityType'] {
    switch (eventType) {
      case 'task':
      case 'task_overdue':
        return 'task';
      case 'appointment':
        return 'appointment';
      default:
        return 'case';
    }
  }
}

// Export singleton instance
export const remindersService = new RemindersService();

// Export class for testing
export { RemindersService };
