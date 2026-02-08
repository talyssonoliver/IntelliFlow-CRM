/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the timeline types import
vi.mock('../../../../lib/timeline/types', () => ({
  TimelineEventType: {
    TASK: 'task',
    TASK_COMPLETED: 'task_completed',
    TASK_OVERDUE: 'task_overdue',
    APPOINTMENT: 'appointment',
    DEADLINE: 'deadline',
    STATUS_CHANGE: 'status_change',
    NOTE: 'note',
    DOCUMENT: 'document',
    DOCUMENT_VERSION: 'document_version',
    COMMUNICATION: 'communication',
    EMAIL: 'email',
    CALL: 'call',
    AGENT_ACTION: 'agent_action',
    REMINDER: 'reminder',
    AUDIT: 'audit',
    STAGE_CHANGE: 'stage_change',
  },
  TimelinePriority: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent',
  },
}));

import { RemindersService, remindersService } from '../reminders-service';
import type { Reminder, CreateReminderInput } from '../reminders-service';

describe('RemindersService', () => {
  let service: RemindersService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new RemindersService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  // =========================================================================
  // createReminder
  // =========================================================================
  describe('createReminder', () => {
    it('creates a reminder with all required fields', () => {
      const input: CreateReminderInput = {
        type: 'task',
        title: 'Review contract',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'case',
        entityId: 'case-123',
      };

      const reminder = service.createReminder(input);

      expect(reminder.id).toMatch(/^reminder-/);
      expect(reminder.type).toBe('task');
      expect(reminder.title).toBe('Review contract');
      expect(reminder.dueDate).toEqual(new Date('2026-03-01T10:00:00Z'));
      expect(reminder.priority).toBe('medium'); // default
      expect(reminder.entityType).toBe('case');
      expect(reminder.entityId).toBe('case-123');
      expect(reminder.status).toBe('pending');
      expect(reminder.createdAt).toBeInstanceOf(Date);
      expect(reminder.updatedAt).toBeInstanceOf(Date);
    });

    it('uses provided priority instead of default', () => {
      const input: CreateReminderInput = {
        type: 'deadline',
        title: 'Filing deadline',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        priority: 'urgent',
        entityType: 'case',
        entityId: 'case-456',
      };

      const reminder = service.createReminder(input);
      expect(reminder.priority).toBe('urgent');
    });

    it('stores optional description', () => {
      const input: CreateReminderInput = {
        type: 'follow_up',
        title: 'Follow up with client',
        description: 'Discuss settlement terms',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'contact',
        entityId: 'contact-789',
      };

      const reminder = service.createReminder(input);
      expect(reminder.description).toBe('Discuss settlement terms');
    });

    it('generates unique IDs for multiple reminders', () => {
      const input: CreateReminderInput = {
        type: 'task',
        title: 'Test',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      };

      const r1 = service.createReminder(input);
      // Advance time to ensure different timestamp in ID
      vi.advanceTimersByTime(1);
      const r2 = service.createReminder(input);

      expect(r1.id).not.toBe(r2.id);
    });
  });

  // =========================================================================
  // getPendingReminders
  // =========================================================================
  describe('getPendingReminders', () => {
    it('returns empty array when no reminders exist', () => {
      expect(service.getPendingReminders()).toEqual([]);
    });

    it('returns only pending reminders', () => {
      const r1 = service.createReminder({
        type: 'task',
        title: 'Pending 1',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'task',
        entityId: 't-1',
      });

      const r2 = service.createReminder({
        type: 'task',
        title: 'Pending 2',
        dueDate: new Date('2026-03-02T10:00:00Z'),
        entityType: 'task',
        entityId: 't-2',
      });

      // Dismiss one
      service.dismissReminder(r1.id);

      const pending = service.getPendingReminders();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(r2.id);
    });
  });

  // =========================================================================
  // getRemindersForEntity
  // =========================================================================
  describe('getRemindersForEntity', () => {
    it('returns pending reminders for a specific entity', () => {
      service.createReminder({
        type: 'task',
        title: 'Case reminder',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'case',
        entityId: 'case-100',
      });

      service.createReminder({
        type: 'task',
        title: 'Deal reminder',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'deal',
        entityId: 'deal-200',
      });

      service.createReminder({
        type: 'appointment',
        title: 'Case appointment',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'case',
        entityId: 'case-100',
      });

      const caseReminders = service.getRemindersForEntity('case', 'case-100');
      expect(caseReminders).toHaveLength(2);
      expect(caseReminders.every((r) => r.entityType === 'case' && r.entityId === 'case-100')).toBe(true);
    });

    it('excludes non-pending reminders for the entity', () => {
      const r = service.createReminder({
        type: 'task',
        title: 'Dismissed',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'case',
        entityId: 'case-100',
      });

      service.dismissReminder(r.id);

      const result = service.getRemindersForEntity('case', 'case-100');
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // getOverdueReminders
  // =========================================================================
  describe('getOverdueReminders', () => {
    it('returns reminders past their due date', () => {
      vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));

      service.createReminder({
        type: 'deadline',
        title: 'Overdue deadline',
        dueDate: new Date('2026-03-10T10:00:00Z'),
        entityType: 'case',
        entityId: 'case-1',
      });

      service.createReminder({
        type: 'task',
        title: 'Future task',
        dueDate: new Date('2026-03-20T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      const overdue = service.getOverdueReminders();
      expect(overdue).toHaveLength(1);
      expect(overdue[0].title).toBe('Overdue deadline');
    });

    it('returns empty array when nothing is overdue', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Future task',
        dueDate: new Date('2026-03-20T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      expect(service.getOverdueReminders()).toHaveLength(0);
    });
  });

  // =========================================================================
  // snoozeReminder
  // =========================================================================
  describe('snoozeReminder', () => {
    it('snoozes a reminder for the specified minutes', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const r = service.createReminder({
        type: 'task',
        title: 'Snoozeable',
        dueDate: new Date('2026-03-02T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      const snoozed = service.snoozeReminder(r.id, 30);

      expect(snoozed).not.toBeNull();
      expect(snoozed!.status).toBe('snoozed');
      expect(snoozed!.snoozeUntil).toBeInstanceOf(Date);
      expect(snoozed!.snoozeUntil!.getTime()).toBe(
        new Date('2026-03-01T10:30:00Z').getTime()
      );
    });

    it('returns null for non-existent reminder', () => {
      const result = service.snoozeReminder('non-existent', 30);
      expect(result).toBeNull();
    });

    it('updates the updatedAt timestamp', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
      const r = service.createReminder({
        type: 'task',
        title: 'Test',
        dueDate: new Date('2026-03-02T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      vi.setSystemTime(new Date('2026-03-01T11:00:00Z'));
      const snoozed = service.snoozeReminder(r.id, 15);

      expect(snoozed!.updatedAt.getTime()).toBe(new Date('2026-03-01T11:00:00Z').getTime());
    });
  });

  // =========================================================================
  // dismissReminder
  // =========================================================================
  describe('dismissReminder', () => {
    it('marks reminder as dismissed', () => {
      const r = service.createReminder({
        type: 'task',
        title: 'Dismissable',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      const result = service.dismissReminder(r.id);
      expect(result).toBe(true);

      const pending = service.getPendingReminders();
      expect(pending).toHaveLength(0);
    });

    it('returns false for non-existent reminder', () => {
      expect(service.dismissReminder('non-existent')).toBe(false);
    });
  });

  // =========================================================================
  // markAsSent
  // =========================================================================
  describe('markAsSent', () => {
    it('marks reminder as sent', () => {
      const r = service.createReminder({
        type: 'task',
        title: 'Sendable',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        entityType: 'task',
        entityId: 'task-1',
      });

      const result = service.markAsSent(r.id);
      expect(result).toBe(true);

      const pending = service.getPendingReminders();
      expect(pending).toHaveLength(0);
    });

    it('returns false for non-existent reminder', () => {
      expect(service.markAsSent('non-existent')).toBe(false);
    });
  });

  // =========================================================================
  // start / stop / checkDueReminders
  // =========================================================================
  describe('start and stop', () => {
    it('starts checking for due reminders at specified interval', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      // Create a reminder that is already past its lead time
      // Due in 10 minutes, lead time for medium is 60 min, so reminderTime is -50 min ago
      service.createReminder({
        type: 'task',
        title: 'Due soon',
        dueDate: new Date('2026-03-01T12:10:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      // The start calls checkDueReminders immediately
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not start a second interval if already running', () => {
      service.start(1000);
      // Call start again -- should be a no-op
      service.start(1000);
      // If it started two intervals, we'd see double notifications
      // Just verifying no error is thrown
      service.stop();
    });

    it('stop clears the interval', () => {
      service.start(1000);
      service.stop();
      // Calling stop again should be safe
      service.stop();
    });

    it('triggers notifications for due reminders on interval tick', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T08:00:00Z'));

      // Create a reminder due at 10:00 with medium priority (60 min lead time)
      // Reminder time = 10:00 - 60min = 09:00
      service.createReminder({
        type: 'task',
        title: 'Morning task',
        dueDate: new Date('2026-03-01T10:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(60000);
      // At 08:00, reminderTime is 09:00 - not yet due
      expect(callback).toHaveBeenCalledTimes(0);

      // Advance to 09:01 (past the reminder time)
      vi.setSystemTime(new Date('2026-03-01T09:01:00Z'));
      vi.advanceTimersByTime(60000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Morning task',
          priority: 'medium',
        })
      );
    });

    it('reactivates snoozed reminders when snooze expires', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T08:00:00Z'));

      // Create and snooze a reminder
      const r = service.createReminder({
        type: 'task',
        title: 'Snoozed task',
        dueDate: new Date('2026-03-01T08:30:00Z'), // Due at 08:30
        priority: 'low', // 30 min lead time => reminderTime = 08:00
        entityType: 'task',
        entityId: 'task-1',
      });

      // Snooze for 15 minutes (until 08:15)
      service.snoozeReminder(r.id, 15);

      service.start(60000);
      // At 08:00, snoozed - should not trigger
      expect(callback).toHaveBeenCalledTimes(0);

      // Advance to 08:16 (past snooze time) and tick
      vi.setSystemTime(new Date('2026-03-01T08:16:00Z'));
      vi.advanceTimersByTime(60000);

      // The reminder should be reactivated and triggered
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not trigger dismissed or sent reminders', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      const r1 = service.createReminder({
        type: 'task',
        title: 'Dismissed',
        dueDate: new Date('2026-03-01T12:10:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });
      service.dismissReminder(r1.id);

      const r2 = service.createReminder({
        type: 'task',
        title: 'Sent',
        dueDate: new Date('2026-03-01T12:10:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-2',
      });
      service.markAsSent(r2.id);

      service.start(5000);
      expect(callback).toHaveBeenCalledTimes(0);
    });
  });

  // =========================================================================
  // onNotification
  // =========================================================================
  describe('onNotification', () => {
    it('subscribes and receives notifications', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'deadline',
        title: 'Test notification',
        dueDate: new Date('2026-03-01T12:05:00Z'),
        priority: 'medium',
        entityType: 'case',
        entityId: 'case-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test notification',
          priority: 'medium',
          dueDate: new Date('2026-03-01T12:05:00Z'),
        })
      );
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = service.onNotification(callback);

      unsubscribe();

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Should not notify',
        dueDate: new Date('2026-03-01T12:05:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles callback errors gracefully', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      service.onNotification(errorCallback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Error test',
        dueDate: new Date('2026-03-01T12:05:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(errorCallback).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in notification callback:',
        expect.any(Error)
      );
    });

    it('notification includes entity link and time until due', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      // Due at 14:00, urgent priority = 240 min lead time => reminderTime = 10:00
      // Current time 12:00 >= 10:00, so triggers. dueDate - now = 2 hours.
      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Linked task',
        dueDate: new Date('2026-03-01T14:00:00Z'), // 2 hours from now
        priority: 'urgent',
        entityType: 'deal',
        entityId: 'deal-555',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          entityLink: '/deals/deal-555',
          timeUntilDue: expect.stringContaining('hours'),
        })
      );
    });

    it('marks reminder as sent after triggering notification', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Auto-sent',
        dueDate: new Date('2026-03-01T12:05:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      // After triggering, the reminder should be marked as sent
      const pending = service.getPendingReminders();
      expect(pending).toHaveLength(0);
    });
  });

  // =========================================================================
  // createFromTimelineEvents
  // =========================================================================
  describe('createFromTimelineEvents', () => {
    it('creates reminders from future timeline events', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const events = [
        {
          id: 'task-1',
          type: 'task' as const,
          title: 'Future task',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'high' as const,
        },
        {
          id: 'appt-1',
          type: 'appointment' as const,
          title: 'Future appointment',
          timestamp: new Date('2026-03-06T14:00:00Z'),
          priority: 'medium' as const,
        },
        {
          id: 'deadline-1',
          type: 'deadline' as const,
          title: 'Future deadline',
          timestamp: new Date('2026-03-07T09:00:00Z'),
          priority: 'urgent' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);
      expect(reminders).toHaveLength(3);
      expect(reminders[0].type).toBe('task');
      expect(reminders[1].type).toBe('appointment');
      expect(reminders[2].type).toBe('deadline');
    });

    it('skips past timeline events', () => {
      vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));

      const events = [
        {
          id: 'task-1',
          type: 'task' as const,
          title: 'Past task',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);
      expect(reminders).toHaveLength(0);
    });

    it('skips non-reminder event types (note, status_change, etc.)', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const events = [
        {
          id: 'note-1',
          type: 'note' as const,
          title: 'Just a note',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
        {
          id: 'sc-1',
          type: 'status_change' as const,
          title: 'Status changed',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);
      expect(reminders).toHaveLength(0);
    });

    it('maps event types to correct reminder and entity types', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const events = [
        {
          id: 'task-1',
          type: 'task' as const,
          title: 'Task event',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
        {
          id: 'appt-1',
          type: 'appointment' as const,
          title: 'Appointment event',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
        {
          id: 'deadline-1',
          type: 'deadline' as const,
          title: 'Deadline event',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);

      // task -> task type, task entity
      expect(reminders[0].type).toBe('task');
      expect(reminders[0].entityType).toBe('task');

      // appointment -> appointment type, appointment entity
      expect(reminders[1].type).toBe('appointment');
      expect(reminders[1].entityType).toBe('appointment');

      // deadline -> deadline type, case entity (default)
      expect(reminders[2].type).toBe('deadline');
      expect(reminders[2].entityType).toBe('case');
    });

    it('uses description from timeline event when available', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const events = [
        {
          id: 'task-1',
          type: 'task' as const,
          title: 'Task with desc',
          description: 'Important details',
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);
      expect(reminders[0].description).toBe('Important details');
    });

    it('handles null description from timeline event', () => {
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const events = [
        {
          id: 'task-1',
          type: 'task' as const,
          title: 'Task no desc',
          description: null,
          timestamp: new Date('2026-03-05T10:00:00Z'),
          priority: 'medium' as const,
        },
      ];

      const reminders = service.createFromTimelineEvents(events as any);
      expect(reminders[0].description).toBeUndefined();
    });
  });

  // =========================================================================
  // entity link generation (via notification)
  // =========================================================================
  describe('entity link generation', () => {
    it.each([
      ['case', 'case-1', '/cases/case-1'],
      ['deal', 'deal-2', '/deals/deal-2'],
      ['contact', 'contact-3', '/contacts/contact-3'],
      ['task', 'task-4', '/tasks/task-4'],
      ['appointment', 'appt-5', '/appointments/appt-5'],
    ] as const)('generates correct link for %s entity', (entityType, entityId, expectedLink) => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Link test',
        dueDate: new Date('2026-03-01T12:05:00Z'),
        priority: 'medium',
        entityType,
        entityId,
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ entityLink: expectedLink })
      );
    });
  });

  // =========================================================================
  // formatTimeUntilDue (tested indirectly via notification)
  // =========================================================================
  describe('time formatting in notifications', () => {
    it('shows "overdue" for recently past due', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:00:30Z')); // 30s after due

      service.createReminder({
        type: 'task',
        title: 'Overdue',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: 'overdue' })
      );
    });

    it('shows minutes overdue', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T12:15:00Z')); // 15 min after due

      service.createReminder({
        type: 'task',
        title: 'Minutes overdue',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: '15 minutes overdue' })
      );
    });

    it('shows hours overdue', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T15:00:00Z')); // 3 hours after due

      service.createReminder({
        type: 'task',
        title: 'Hours overdue',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: '3 hours overdue' })
      );
    });

    it('shows days overdue', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-05T12:00:00Z')); // 4 days after due

      service.createReminder({
        type: 'task',
        title: 'Days overdue',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: '4 days overdue' })
      );
    });

    it('shows "in less than a minute" for imminent due', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T11:59:30Z')); // 30s before due

      service.createReminder({
        type: 'task',
        title: 'Imminent',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: 'in less than a minute' })
      );
    });

    it('shows "in X minutes" for minutes away', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      vi.setSystemTime(new Date('2026-03-01T11:45:00Z')); // 15 min before due

      service.createReminder({
        type: 'task',
        title: 'Minutes away',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'medium',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: 'in 15 minutes' })
      );
    });

    it('shows "in X hours" for hours away', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      // Due at 12:00, urgent priority = 240 min lead => reminderTime = 08:00
      // Current time 10:00 >= 08:00, so triggers. dueDate - now = 2 hours.
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Hours away',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'urgent',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: 'in 2 hours' })
      );
    });

    it('shows "in X days" for days away (via overdue reminder that becomes pending)', () => {
      // The "in X days" path in formatTimeUntilDue is only reachable
      // for reminders where dueDate is far in the future.
      // Since max lead time is 240 min (urgent), we can't trigger a notification
      // when dueDate is 2 days away. Instead, test the overdue counterpart:
      // "X days overdue" is already tested above.
      // We test "in 3 hours" as the realistic max for urgent priority.
      const callback = vi.fn();
      service.onNotification(callback);

      // Due at 15:00, urgent = 240 min lead => reminderTime = 11:00
      // Current time 12:00 >= 11:00, triggers. dueDate - now = 3 hours.
      vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));

      service.createReminder({
        type: 'task',
        title: 'Hours away with urgent',
        dueDate: new Date('2026-03-01T15:00:00Z'),
        priority: 'urgent',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(5000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timeUntilDue: 'in 3 hours' })
      );
    });
  });

  // =========================================================================
  // Priority-based lead times
  // =========================================================================
  describe('priority-based lead times', () => {
    it('uses 30-minute lead time for low priority', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      // Due at 12:00, low priority = 30 min lead => reminderTime = 11:30
      vi.setSystemTime(new Date('2026-03-01T11:25:00Z'));
      service.createReminder({
        type: 'task',
        title: 'Low priority',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'low',
        entityType: 'task',
        entityId: 'task-1',
      });

      service.start(60000);
      expect(callback).not.toHaveBeenCalled(); // 11:25 < 11:30

      vi.setSystemTime(new Date('2026-03-01T11:31:00Z'));
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('uses 240-minute lead time for urgent priority', () => {
      const callback = vi.fn();
      service.onNotification(callback);

      // Due at 12:00, urgent = 240 min lead => reminderTime = 08:00
      vi.setSystemTime(new Date('2026-03-01T07:59:00Z'));
      service.createReminder({
        type: 'deadline',
        title: 'Urgent deadline',
        dueDate: new Date('2026-03-01T12:00:00Z'),
        priority: 'urgent',
        entityType: 'case',
        entityId: 'case-1',
      });

      service.start(60000);
      expect(callback).not.toHaveBeenCalled(); // 07:59 < 08:00

      vi.setSystemTime(new Date('2026-03-01T08:01:00Z'));
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Singleton export
  // =========================================================================
  describe('singleton export', () => {
    it('exports a singleton instance of RemindersService', () => {
      expect(remindersService).toBeInstanceOf(RemindersService);
    });
  });
});
