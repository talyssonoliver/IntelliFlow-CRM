/**
 * Case Reminders Service - IFC-147
 *
 * Manages deadline reminders for cases, tasks, and appointments.
 * Integrates with the deadline engine to compute due dates and trigger
 * notifications at configurable intervals.
 */

import type { Case, CaseTask } from '@intelliflow/domain';

// ============================================================================
// Types
// ============================================================================

export interface ReminderConfig {
  /** Reminder intervals before deadline (in hours) */
  intervals: number[];
  /** Default reminder intervals if not specified */
  defaultIntervals: number[];
  /** Whether to send reminders for past-due items */
  sendPastDueReminders: boolean;
  /** Maximum number of reminders per item */
  maxRemindersPerItem: number;
}

export interface Reminder {
  id: string;
  caseId: string;
  taskId?: string;
  appointmentId?: string;
  type: 'DEADLINE' | 'APPOINTMENT' | 'FOLLOW_UP' | 'REVIEW';
  title: string;
  description: string;
  dueDate: Date;
  reminderDate: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'SNOOZED' | 'DISMISSED';
  recipientIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderSchedule {
  caseId: string;
  reminders: Reminder[];
  nextReminderAt: Date | null;
}

export interface DeadlineInfo {
  id: string;
  title: string;
  dueDate: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  type: 'TASK' | 'APPOINTMENT' | 'COURT_DATE' | 'FILING' | 'REVIEW';
  relatedEntityId: string;
  relatedEntityType: 'CASE' | 'TASK' | 'APPOINTMENT';
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ReminderConfig = {
  intervals: [168, 72, 24, 4, 1], // 7 days, 3 days, 1 day, 4 hours, 1 hour before
  defaultIntervals: [24, 4], // 1 day and 4 hours before
  sendPastDueReminders: true,
  maxRemindersPerItem: 5,
};

// ============================================================================
// Reminder Service
// ============================================================================

export class RemindersService {
  private config: ReminderConfig;
  private reminders: Map<string, Reminder[]> = new Map();

  constructor(config: Partial<ReminderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate reminder dates for a given deadline
   */
  calculateReminderDates(dueDate: Date, intervals: number[] = this.config.defaultIntervals): Date[] {
    const now = new Date();
    const reminderDates: Date[] = [];

    for (const hoursBeforeDue of intervals) {
      const reminderDate = new Date(dueDate.getTime() - hoursBeforeDue * 60 * 60 * 1000);

      // Only include future reminders (or past-due if configured)
      if (reminderDate > now || this.config.sendPastDueReminders) {
        reminderDates.push(reminderDate);
      }
    }

    // Sort by date ascending
    return reminderDates.sort((a, b) => a.getTime() - b.getTime());
  }

  /**
   * Create reminders for a deadline
   */
  createRemindersForDeadline(deadline: DeadlineInfo, recipientIds: string[]): Reminder[] {
    const reminderDates = this.calculateReminderDates(deadline.dueDate, this.config.intervals);
    const createdReminders: Reminder[] = [];

    for (let i = 0; i < Math.min(reminderDates.length, this.config.maxRemindersPerItem); i++) {
      const reminder: Reminder = {
        id: `rem_${deadline.id}_${i}`,
        caseId: deadline.relatedEntityType === 'CASE' ? deadline.relatedEntityId : '',
        taskId: deadline.relatedEntityType === 'TASK' ? deadline.relatedEntityId : undefined,
        appointmentId: deadline.relatedEntityType === 'APPOINTMENT' ? deadline.relatedEntityId : undefined,
        type: this.mapDeadlineTypeToReminderType(deadline.type),
        title: this.formatReminderTitle(deadline, reminderDates[i]),
        description: `Reminder: ${deadline.title} is due on ${deadline.dueDate.toISOString()}`,
        dueDate: deadline.dueDate,
        reminderDate: reminderDates[i],
        priority: deadline.priority,
        status: 'PENDING',
        recipientIds,
        metadata: {
          deadlineId: deadline.id,
          hoursBeforeDue: this.config.intervals[i],
          reminderIndex: i,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      createdReminders.push(reminder);
    }

    // Store reminders
    const existingReminders = this.reminders.get(deadline.id) || [];
    this.reminders.set(deadline.id, [...existingReminders, ...createdReminders]);

    return createdReminders;
  }

  /**
   * Get pending reminders that should be sent now
   */
  getPendingReminders(asOf: Date = new Date()): Reminder[] {
    const pendingReminders: Reminder[] = [];

    for (const reminders of this.reminders.values()) {
      for (const reminder of reminders) {
        if (reminder.status === 'PENDING' && reminder.reminderDate <= asOf) {
          pendingReminders.push(reminder);
        }
      }
    }

    return pendingReminders.sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime());
  }

  /**
   * Mark a reminder as sent
   */
  markAsSent(reminderId: string): boolean {
    for (const reminders of this.reminders.values()) {
      const reminder = reminders.find((r) => r.id === reminderId);
      if (reminder) {
        reminder.status = 'SENT';
        reminder.updatedAt = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Acknowledge a reminder
   */
  acknowledge(reminderId: string): boolean {
    for (const reminders of this.reminders.values()) {
      const reminder = reminders.find((r) => r.id === reminderId);
      if (reminder) {
        reminder.status = 'ACKNOWLEDGED';
        reminder.updatedAt = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Snooze a reminder for a specified duration
   */
  snooze(reminderId: string, snoozeMinutes: number = 30): boolean {
    for (const reminders of this.reminders.values()) {
      const reminder = reminders.find((r) => r.id === reminderId);
      if (reminder) {
        reminder.status = 'SNOOZED';
        reminder.reminderDate = new Date(Date.now() + snoozeMinutes * 60 * 1000);
        reminder.updatedAt = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Dismiss a reminder
   */
  dismiss(reminderId: string): boolean {
    for (const reminders of this.reminders.values()) {
      const reminder = reminders.find((r) => r.id === reminderId);
      if (reminder) {
        reminder.status = 'DISMISSED';
        reminder.updatedAt = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Get reminder schedule for a case
   */
  getReminderSchedule(caseId: string): ReminderSchedule {
    const caseReminders: Reminder[] = [];

    for (const reminders of this.reminders.values()) {
      for (const reminder of reminders) {
        if (reminder.caseId === caseId) {
          caseReminders.push(reminder);
        }
      }
    }

    const pendingReminders = caseReminders
      .filter((r) => r.status === 'PENDING' || r.status === 'SNOOZED')
      .sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime());

    return {
      caseId,
      reminders: caseReminders,
      nextReminderAt: pendingReminders.length > 0 ? pendingReminders[0].reminderDate : null,
    };
  }

  /**
   * Cancel all reminders for a deadline
   */
  cancelRemindersForDeadline(deadlineId: string): number {
    const reminders = this.reminders.get(deadlineId);
    if (!reminders) return 0;

    let cancelledCount = 0;
    for (const reminder of reminders) {
      if (reminder.status === 'PENDING' || reminder.status === 'SNOOZED') {
        reminder.status = 'DISMISSED';
        reminder.updatedAt = new Date();
        cancelledCount++;
      }
    }

    return cancelledCount;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapDeadlineTypeToReminderType(type: DeadlineInfo['type']): Reminder['type'] {
    switch (type) {
      case 'COURT_DATE':
      case 'FILING':
        return 'DEADLINE';
      case 'APPOINTMENT':
        return 'APPOINTMENT';
      case 'REVIEW':
        return 'REVIEW';
      default:
        return 'FOLLOW_UP';
    }
  }

  private formatReminderTitle(deadline: DeadlineInfo, reminderDate: Date): string {
    const hoursUntilDue = Math.round(
      (deadline.dueDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60)
    );

    if (hoursUntilDue <= 0) {
      return `OVERDUE: ${deadline.title}`;
    } else if (hoursUntilDue < 24) {
      return `Due in ${hoursUntilDue} hour${hoursUntilDue !== 1 ? 's' : ''}: ${deadline.title}`;
    } else {
      const days = Math.round(hoursUntilDue / 24);
      return `Due in ${days} day${days !== 1 ? 's' : ''}: ${deadline.title}`;
    }
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const remindersService = new RemindersService();

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Create reminders for all deadlines in a case
 */
export function createCaseReminders(
  case_: Case,
  tasks: CaseTask[],
  assigneeIds: string[]
): Reminder[] {
  const service = new RemindersService();
  const allReminders: Reminder[] = [];

  // Create reminders for case deadlines
  for (const task of tasks) {
    if (task.dueDate) {
      const deadline: DeadlineInfo = {
        id: task.id.value,
        title: task.title,
        dueDate: new Date(task.dueDate),
        priority: 'MEDIUM', // CaseTask doesn't have priority, use default
        type: 'TASK',
        relatedEntityId: task.id.value,
        relatedEntityType: 'TASK',
      };

      const reminders = service.createRemindersForDeadline(deadline, assigneeIds);
      allReminders.push(...reminders);
    }
  }

  return allReminders;
}

/**
 * Check if a reminder is urgent (due within 4 hours)
 */
export function isUrgentReminder(reminder: Reminder): boolean {
  const hoursUntilDue = (reminder.dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilDue <= 4;
}

/**
 * Check if a deadline is past due
 */
export function isPastDue(dueDate: Date): boolean {
  return dueDate.getTime() < Date.now();
}
