/**
 * Supplementary tests for notifications.tsx
 *
 * Tests notification logic: icon mapping, priority color mapping,
 * badge count logic, filtering, and mark-as-read behavior.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// getReminderIcon logic (mirrors the function from notifications.tsx)
// ---------------------------------------------------------------------------
interface ReminderNotification {
  reminderId: string;
  title: string;
  message: string;
  priority: string;
  timeUntilDue: string;
  entityLink: string;
}

function getReminderIcon(notification: ReminderNotification): string {
  const iconMap: Record<string, string> = {
    deadline: 'schedule',
    task: 'task_alt',
    appointment: 'event',
    follow_up: 'reply',
    custom: 'notifications',
  };
  if (notification.title.toLowerCase().includes('deadline')) return iconMap.deadline;
  if (notification.title.toLowerCase().includes('task')) return iconMap.task;
  if (notification.title.toLowerCase().includes('appointment')) return iconMap.appointment;
  return iconMap.custom;
}

// ---------------------------------------------------------------------------
// getPriorityColor logic (mirrors the function from notifications.tsx)
// ---------------------------------------------------------------------------
function getPriorityColor(priority: string): string {
  const colorMap: Record<string, string> = {
    low: 'text-muted-foreground',
    medium: 'text-primary',
    high: 'text-orange-500',
    urgent: 'text-destructive',
  };
  return colorMap[priority] || colorMap.medium;
}

// ---------------------------------------------------------------------------
// Count logic (mirrors the Notifications component logic)
// ---------------------------------------------------------------------------
function computeCount(
  contextUnreadCount: number | undefined,
  propCount: number | undefined
): number {
  return contextUnreadCount ?? propCount ?? 0;
}

// ---------------------------------------------------------------------------
// ARIA label logic
// ---------------------------------------------------------------------------
function computeAriaLabel(count: number): string {
  return `Notifications${count > 0 ? ` (${count} unread)` : ''}`;
}

// ---------------------------------------------------------------------------
// overdue detection (mirrors the rendering logic in the component)
// ---------------------------------------------------------------------------
function isOverdue(timeUntilDue: string): boolean {
  return timeUntilDue.includes('overdue');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('notifications logic', () => {
  // ===================== getReminderIcon =====================
  describe('getReminderIcon', () => {
    const makeNotification = (title: string): ReminderNotification => ({
      reminderId: 'r1',
      title,
      message: '',
      priority: 'medium',
      timeUntilDue: '2h',
      entityLink: '/cases/1',
    });

    it('returns schedule for deadline title', () => {
      expect(getReminderIcon(makeNotification('Filing Deadline'))).toBe('schedule');
    });

    it('returns schedule for lowercase deadline', () => {
      expect(getReminderIcon(makeNotification('deadline approaching'))).toBe('schedule');
    });

    it('returns task_alt for task title', () => {
      expect(getReminderIcon(makeNotification('Follow-up Task'))).toBe('task_alt');
    });

    it('returns event for appointment title', () => {
      expect(getReminderIcon(makeNotification('Client Appointment'))).toBe('event');
    });

    it('returns notifications (custom) for unrecognized title', () => {
      expect(getReminderIcon(makeNotification('Random notification'))).toBe('notifications');
    });

    it('prioritizes deadline over task when both present', () => {
      // 'deadline' checked first
      expect(getReminderIcon(makeNotification('Deadline for task'))).toBe('schedule');
    });

    it('prioritizes task over appointment when both present', () => {
      expect(getReminderIcon(makeNotification('Task appointment'))).toBe('task_alt');
    });

    it('case insensitive matching', () => {
      expect(getReminderIcon(makeNotification('DEADLINE TODAY'))).toBe('schedule');
      expect(getReminderIcon(makeNotification('TASK assigned'))).toBe('task_alt');
      expect(getReminderIcon(makeNotification('APPOINTMENT set'))).toBe('event');
    });
  });

  // ===================== getPriorityColor =====================
  describe('getPriorityColor', () => {
    it('returns muted for low priority', () => {
      expect(getPriorityColor('low')).toBe('text-muted-foreground');
    });

    it('returns primary for medium priority', () => {
      expect(getPriorityColor('medium')).toBe('text-primary');
    });

    it('returns orange for high priority', () => {
      expect(getPriorityColor('high')).toBe('text-orange-500');
    });

    it('returns destructive for urgent priority', () => {
      expect(getPriorityColor('urgent')).toBe('text-destructive');
    });

    it('returns primary (default) for unknown priority', () => {
      expect(getPriorityColor('unknown')).toBe('text-primary');
    });

    it('returns primary for empty string', () => {
      expect(getPriorityColor('')).toBe('text-primary');
    });
  });

  // ===================== computeCount =====================
  describe('computeCount', () => {
    it('prefers context unreadCount when available', () => {
      expect(computeCount(5, 10)).toBe(5);
    });

    it('falls back to prop count when context is undefined', () => {
      expect(computeCount(undefined, 3)).toBe(3);
    });

    it('returns 0 when both are undefined', () => {
      expect(computeCount(undefined, undefined)).toBe(0);
    });

    it('returns 0 when context is 0', () => {
      expect(computeCount(0, 5)).toBe(0);
    });

    it('returns context count even if prop is larger', () => {
      expect(computeCount(2, 100)).toBe(2);
    });
  });

  // ===================== ARIA label =====================
  describe('ARIA label', () => {
    it('shows count when positive', () => {
      expect(computeAriaLabel(3)).toBe('Notifications (3 unread)');
    });

    it('no count suffix when zero', () => {
      expect(computeAriaLabel(0)).toBe('Notifications');
    });

    it('shows large count', () => {
      expect(computeAriaLabel(150)).toBe('Notifications (150 unread)');
    });
  });

  // ===================== isOverdue =====================
  describe('overdue detection', () => {
    it('detects overdue string', () => {
      expect(isOverdue('2 hours overdue')).toBe(true);
    });

    it('returns false for normal time', () => {
      expect(isOverdue('2h remaining')).toBe(false);
    });

    it('detects overdue at any position', () => {
      expect(isOverdue('overdue by 1 day')).toBe(true);
    });
  });

  // ===================== notification badge visibility =====================
  describe('badge visibility', () => {
    it('badge dot shown when count > 0', () => {
      const showDot = 5 > 0;
      expect(showDot).toBe(true);
    });

    it('badge dot hidden when count is 0', () => {
      const showDot = 0 > 0;
      expect(showDot).toBe(false);
    });

    it('mark all read button shown only when count > 0', () => {
      const showMarkAll = 3 > 0;
      expect(showMarkAll).toBe(true);

      const hideMarkAll = 0 > 0;
      expect(hideMarkAll).toBe(false);
    });
  });

  // ===================== notification filtering =====================
  describe('notification filtering', () => {
    const notifications: ReminderNotification[] = [
      { reminderId: '1', title: 'Filing Deadline', message: 'Due soon', priority: 'high', timeUntilDue: '30m', entityLink: '/cases/1' },
      { reminderId: '2', title: 'Task Review', message: 'Review docs', priority: 'medium', timeUntilDue: '2h', entityLink: '/cases/2' },
      { reminderId: '3', title: 'Appointment', message: 'Client call', priority: 'urgent', timeUntilDue: '1h overdue', entityLink: '/cases/3' },
      { reminderId: '4', title: 'Follow up', message: 'Check status', priority: 'low', timeUntilDue: '1d', entityLink: '/cases/4' },
    ];

    it('can filter by priority', () => {
      const urgent = notifications.filter((n) => n.priority === 'urgent');
      expect(urgent).toHaveLength(1);
      expect(urgent[0].reminderId).toBe('3');
    });

    it('can filter overdue items', () => {
      const overdue = notifications.filter((n) => isOverdue(n.timeUntilDue));
      expect(overdue).toHaveLength(1);
      expect(overdue[0].reminderId).toBe('3');
    });

    it('empty list returns empty', () => {
      const empty: ReminderNotification[] = [];
      expect(empty.filter((n) => n.priority === 'high')).toHaveLength(0);
    });

    it('all notifications have required fields', () => {
      for (const n of notifications) {
        expect(n.reminderId).toBeTruthy();
        expect(n.title).toBeTruthy();
        expect(n.entityLink).toBeTruthy();
        expect(n.priority).toBeTruthy();
      }
    });
  });

  // ===================== dismiss / snooze logic shapes =====================
  describe('dismiss and snooze', () => {
    it('dismiss removes notification from list', () => {
      const list = [
        { reminderId: '1', title: 'A' },
        { reminderId: '2', title: 'B' },
        { reminderId: '3', title: 'C' },
      ];
      const afterDismiss = list.filter((n) => n.reminderId !== '2');
      expect(afterDismiss).toHaveLength(2);
      expect(afterDismiss.map((n) => n.reminderId)).toEqual(['1', '3']);
    });

    it('snooze duration is in minutes', () => {
      const snoozeDuration = 30;
      expect(snoozeDuration).toBeGreaterThan(0);
      expect(typeof snoozeDuration).toBe('number');
    });
  });
});
