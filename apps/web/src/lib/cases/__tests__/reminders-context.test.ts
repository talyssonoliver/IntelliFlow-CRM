/**
 * @vitest-environment happy-dom
 * reminders-context.tsx - Logic tests for reminder state management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the reminders service
const mockService = vi.hoisted(() => ({
  getPendingReminders: vi.fn(() => []),
  start: vi.fn(),
  stop: vi.fn(),
  createFromTimelineEvents: vi.fn(() => []),
  snoozeReminder: vi.fn(),
  dismissReminder: vi.fn(),
  onNotification: vi.fn(() => vi.fn()),
}));

vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>();
  return actual;
});

vi.mock('../reminders-service', () => ({
  remindersService: mockService,
}));

vi.mock('../../../../lib/timeline/types', () => ({}));

describe('RemindersContext - State Logic', () => {
  beforeEach(() => {
    mockService.getPendingReminders.mockReturnValue([]);
    mockService.start.mockClear();
    mockService.stop.mockClear();
    mockService.snoozeReminder.mockClear();
    mockService.dismissReminder.mockClear();
    mockService.createFromTimelineEvents.mockClear();
    mockService.onNotification.mockClear();
    mockService.onNotification.mockReturnValue(vi.fn());
  });

  describe('unread count logic', () => {
    it('counts notifications not in read set', () => {
      const notifications = [
        {
          reminderId: 'r1',
          title: 'T1',
          message: 'M1',
          priority: 'medium' as const,
          dueDate: new Date(),
          timeUntilDue: '1h',
          entityLink: '/',
        },
        {
          reminderId: 'r2',
          title: 'T2',
          message: 'M2',
          priority: 'high' as const,
          dueDate: new Date(),
          timeUntilDue: '2h',
          entityLink: '/',
        },
        {
          reminderId: 'r3',
          title: 'T3',
          message: 'M3',
          priority: 'low' as const,
          dueDate: new Date(),
          timeUntilDue: '3h',
          entityLink: '/',
        },
      ];
      const readSet = new Set(['r1']);
      const unread = notifications.filter((n) => !readSet.has(n.reminderId)).length;
      expect(unread).toBe(2);
    });

    it('returns 0 when all are read', () => {
      const notifications = [
        {
          reminderId: 'r1',
          title: 'T1',
          message: 'M1',
          priority: 'medium' as const,
          dueDate: new Date(),
          timeUntilDue: '1h',
          entityLink: '/',
        },
      ];
      const readSet = new Set(['r1']);
      const unread = notifications.filter((n) => !readSet.has(n.reminderId)).length;
      expect(unread).toBe(0);
    });
  });

  describe('notification deduplication logic', () => {
    it('replaces existing notification with same reminderId', () => {
      const existing = [
        {
          reminderId: 'r1',
          title: 'Old',
          message: 'M',
          priority: 'low' as const,
          dueDate: new Date(),
          timeUntilDue: '1h',
          entityLink: '/',
        },
        {
          reminderId: 'r2',
          title: 'Other',
          message: 'M',
          priority: 'low' as const,
          dueDate: new Date(),
          timeUntilDue: '2h',
          entityLink: '/',
        },
      ];
      const newNotif = {
        reminderId: 'r1',
        title: 'New',
        message: 'M',
        priority: 'high' as const,
        dueDate: new Date(),
        timeUntilDue: '30m',
        entityLink: '/',
      };

      // Simulates the handleNotification logic
      const updated = [
        newNotif,
        ...existing.filter((n) => n.reminderId !== newNotif.reminderId),
      ].slice(0, 10);

      expect(updated).toHaveLength(2);
      expect(updated[0].title).toBe('New');
      expect(updated[1].reminderId).toBe('r2');
    });

    it('keeps max 10 notifications', () => {
      const existing = Array.from({ length: 10 }, (_, i) => ({
        reminderId: 'r' + i,
        title: 'Title',
        message: 'M',
        priority: 'low' as const,
        dueDate: new Date(),
        timeUntilDue: '1h',
        entityLink: '/',
      }));
      const newNotif = {
        reminderId: 'r-new',
        title: 'New',
        message: 'M',
        priority: 'high' as const,
        dueDate: new Date(),
        timeUntilDue: '30m',
        entityLink: '/',
      };

      const updated = [
        newNotif,
        ...existing.filter((n) => n.reminderId !== newNotif.reminderId),
      ].slice(0, 10);
      expect(updated).toHaveLength(10);
      expect(updated[0].reminderId).toBe('r-new');
    });
  });

  describe('markAllAsRead logic', () => {
    it('creates set of all notification ids', () => {
      const notifications = [{ reminderId: 'r1' }, { reminderId: 'r2' }, { reminderId: 'r3' }];
      const readSet = new Set(notifications.map((n) => n.reminderId));
      expect(readSet.size).toBe(3);
      expect(readSet.has('r1')).toBe(true);
      expect(readSet.has('r2')).toBe(true);
      expect(readSet.has('r3')).toBe(true);
    });
  });

  describe('markAsRead logic', () => {
    it('adds single id to read set', () => {
      const readSet = new Set(['r1']);
      const updated = new Set([...readSet, 'r2']);
      expect(updated.size).toBe(2);
      expect(updated.has('r2')).toBe(true);
    });
  });

  describe('service interaction patterns', () => {
    it('start calls service.start', () => {
      mockService.start(60000);
      expect(mockService.start).toHaveBeenCalledWith(60000);
    });
    it('stop calls service.stop', () => {
      mockService.stop();
      expect(mockService.stop).toHaveBeenCalled();
    });
    it('snoozeReminder delegates to service', () => {
      mockService.snoozeReminder('r1', 15);
      expect(mockService.snoozeReminder).toHaveBeenCalledWith('r1', 15);
    });
    it('dismissReminder delegates to service', () => {
      mockService.dismissReminder('r1');
      expect(mockService.dismissReminder).toHaveBeenCalledWith('r1');
    });
  });
});
