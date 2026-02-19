/**
 * @vitest-environment happy-dom
 *
 * Reminders Context - Supplementary Tests
 *
 * Task: IFC-147 - Case Timeline UI with Deadline Engine
 *
 * The existing test file covers pure logic (unread count, notification
 * deduplication, markAllAsRead, service interaction patterns).
 * This file tests the actual React provider and hooks via
 * @testing-library/react, including:
 * - RemindersProvider rendering
 * - useReminders hook
 * - useRemindersOptional hook
 * - Auto-start behaviour
 * - Snooze/dismiss integration
 * - Notification subscription lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// ============================================================
// Hoisted mocks
// ============================================================

const mocks = vi.hoisted(() => {
  const notificationCallbacks: Array<(notification: any) => void> = [];
  return {
    notificationCallbacks,
    mockStart: vi.fn(),
    mockStop: vi.fn(),
    mockGetPendingReminders: vi.fn((): any[] => []),
    mockCreateFromTimelineEvents: vi.fn(() => []),
    mockSnoozeReminder: vi.fn(),
    mockDismissReminder: vi.fn(),
    mockOnNotification: vi.fn((cb: (notification: any) => void) => {
      notificationCallbacks.push(cb);
      return () => {
        const idx = notificationCallbacks.indexOf(cb);
        if (idx >= 0) notificationCallbacks.splice(idx, 1);
      };
    }),
  };
});

// ============================================================
// vi.mock declarations
// ============================================================

vi.mock('../reminders-service', () => ({
  remindersService: {
    start: mocks.mockStart,
    stop: mocks.mockStop,
    getPendingReminders: mocks.mockGetPendingReminders,
    createFromTimelineEvents: mocks.mockCreateFromTimelineEvents,
    snoozeReminder: mocks.mockSnoozeReminder,
    dismissReminder: mocks.mockDismissReminder,
    onNotification: mocks.mockOnNotification,
  },
}));

vi.mock('../../../../lib/timeline/types', () => ({}));

// ============================================================
// Import after mocks
// ============================================================

import { RemindersProvider, useReminders, useRemindersOptional } from '../reminders-context';

// ============================================================
// Helper components
// ============================================================

function RemindersConsumer() {
  const ctx = useReminders();
  return (
    <div>
      <span data-testid="pending-count">{ctx.pendingCount}</span>
      <span data-testid="unread-count">{ctx.unreadCount}</span>
      <span data-testid="is-running">{String(ctx.isRunning)}</span>
      <span data-testid="recent-count">{ctx.recentNotifications.length}</span>
      <button data-testid="btn-start" onClick={ctx.start}>
        Start
      </button>
      <button data-testid="btn-stop" onClick={ctx.stop}>
        Stop
      </button>
      <button data-testid="btn-snooze" onClick={() => ctx.snoozeReminder('r1', 15)}>
        Snooze
      </button>
      <button data-testid="btn-dismiss" onClick={() => ctx.dismissReminder('r1')}>
        Dismiss
      </button>
      <button data-testid="btn-mark-all-read" onClick={ctx.markAllAsRead}>
        Mark All Read
      </button>
      <button data-testid="btn-mark-read" onClick={() => ctx.markAsRead('r1')}>
        Mark Read
      </button>
    </div>
  );
}

function OptionalConsumer() {
  const ctx = useRemindersOptional();
  return <div data-testid="optional-result">{ctx === null ? 'null' : 'has-context'}</div>;
}

function renderWithProvider(props: { autoStart?: boolean; checkInterval?: number } = {}) {
  return render(
    <RemindersProvider autoStart={props.autoStart} checkInterval={props.checkInterval}>
      <RemindersConsumer />
    </RemindersProvider>
  );
}

// ============================================================
// Tests
// ============================================================

describe('RemindersContext - Provider and Hooks (supplementary)', () => {
  beforeEach(() => {
    mocks.mockStart.mockClear();
    mocks.mockStop.mockClear();
    mocks.mockGetPendingReminders.mockReturnValue([]);
    mocks.mockCreateFromTimelineEvents.mockReturnValue([]);
    mocks.mockSnoozeReminder.mockClear();
    mocks.mockDismissReminder.mockClear();
    mocks.mockOnNotification.mockClear();
    mocks.notificationCallbacks.length = 0;

    // Re-setup the mockOnNotification return value
    mocks.mockOnNotification.mockImplementation((cb: (notification: any) => void) => {
      mocks.notificationCallbacks.push(cb);
      return () => {
        const idx = mocks.notificationCallbacks.indexOf(cb);
        if (idx >= 0) mocks.notificationCallbacks.splice(idx, 1);
      };
    });
  });

  describe('Provider rendering', () => {
    it('renders children', () => {
      renderWithProvider();
      expect(screen.getByTestId('pending-count')).toBeInTheDocument();
    });

    it('shows initial pending count of 0', () => {
      renderWithProvider();
      expect(screen.getByTestId('pending-count').textContent).toBe('0');
    });

    it('shows initial unread count of 0', () => {
      renderWithProvider();
      expect(screen.getByTestId('unread-count').textContent).toBe('0');
    });
  });

  describe('Auto-start', () => {
    it('starts the service automatically when autoStart is true (default)', () => {
      renderWithProvider();
      expect(mocks.mockStart).toHaveBeenCalled();
    });

    it('does not start when autoStart is false', () => {
      renderWithProvider({ autoStart: false });
      expect(mocks.mockStart).not.toHaveBeenCalled();
    });

    it('passes checkInterval to service start', () => {
      renderWithProvider({ checkInterval: 30000 });
      expect(mocks.mockStart).toHaveBeenCalledWith(30000);
    });

    it('subscribes to notifications on mount', () => {
      renderWithProvider();
      expect(mocks.mockOnNotification).toHaveBeenCalled();
    });
  });

  describe('Manual start/stop', () => {
    it('start button calls service.start', () => {
      renderWithProvider({ autoStart: false });

      act(() => {
        screen.getByTestId('btn-start').click();
      });

      expect(mocks.mockStart).toHaveBeenCalled();
    });

    it('stop button calls service.stop', () => {
      renderWithProvider();

      act(() => {
        screen.getByTestId('btn-stop').click();
      });

      expect(mocks.mockStop).toHaveBeenCalled();
    });
  });

  describe('Snooze and dismiss', () => {
    it('snooze delegates to service', () => {
      renderWithProvider();

      act(() => {
        screen.getByTestId('btn-snooze').click();
      });

      expect(mocks.mockSnoozeReminder).toHaveBeenCalledWith('r1', 15);
    });

    it('dismiss delegates to service', () => {
      renderWithProvider();

      act(() => {
        screen.getByTestId('btn-dismiss').click();
      });

      expect(mocks.mockDismissReminder).toHaveBeenCalledWith('r1');
    });
  });

  describe('Notification handling', () => {
    it('increments unread count when notification arrives', () => {
      renderWithProvider();

      act(() => {
        // Simulate a notification arriving
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r1',
            title: 'Test Reminder',
            message: 'Due soon',
            priority: 'high',
            dueDate: new Date(),
            timeUntilDue: '30m',
            entityLink: '/cases/1',
          });
        }
      });

      expect(screen.getByTestId('unread-count').textContent).toBe('1');
      expect(screen.getByTestId('recent-count').textContent).toBe('1');
    });

    it('deduplicates notifications with same reminderId', () => {
      renderWithProvider();

      act(() => {
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r1',
            title: 'Reminder v1',
            message: 'Due soon',
            priority: 'medium',
            dueDate: new Date(),
            timeUntilDue: '1h',
            entityLink: '/',
          });
        }
      });

      act(() => {
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r1',
            title: 'Reminder v2',
            message: 'Due very soon',
            priority: 'high',
            dueDate: new Date(),
            timeUntilDue: '5m',
            entityLink: '/',
          });
        }
      });

      // Should still be 1 notification (deduped)
      expect(screen.getByTestId('recent-count').textContent).toBe('1');
    });
  });

  describe('Mark as read', () => {
    it('markAllAsRead clears unread count', () => {
      renderWithProvider();

      // Send a notification first
      act(() => {
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r1',
            title: 'Test',
            message: 'Due',
            priority: 'medium',
            dueDate: new Date(),
            timeUntilDue: '1h',
            entityLink: '/',
          });
        }
      });

      expect(screen.getByTestId('unread-count').textContent).toBe('1');

      act(() => {
        screen.getByTestId('btn-mark-all-read').click();
      });

      expect(screen.getByTestId('unread-count').textContent).toBe('0');
    });

    it('markAsRead decrements unread for specific notification', () => {
      renderWithProvider();

      // Send two notifications
      act(() => {
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r1',
            title: 'T1',
            message: 'M1',
            priority: 'medium',
            dueDate: new Date(),
            timeUntilDue: '1h',
            entityLink: '/',
          });
        }
      });

      act(() => {
        for (const cb of mocks.notificationCallbacks) {
          cb({
            reminderId: 'r2',
            title: 'T2',
            message: 'M2',
            priority: 'high',
            dueDate: new Date(),
            timeUntilDue: '2h',
            entityLink: '/',
          });
        }
      });

      expect(screen.getByTestId('unread-count').textContent).toBe('2');

      act(() => {
        screen.getByTestId('btn-mark-read').click();
      });

      expect(screen.getByTestId('unread-count').textContent).toBe('1');
    });
  });

  describe('Pending reminders', () => {
    it('reflects pending count from service', () => {
      mocks.mockGetPendingReminders.mockReturnValue([
        { id: 'r1', status: 'pending' },
        { id: 'r2', status: 'pending' },
      ]);

      renderWithProvider();

      expect(screen.getByTestId('pending-count').textContent).toBe('2');
    });
  });

  describe('useReminders outside provider', () => {
    it('throws when used outside RemindersProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<RemindersConsumer />);
      }).toThrow('useReminders must be used within a RemindersProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('useRemindersOptional', () => {
    it('returns null when used outside provider', () => {
      render(<OptionalConsumer />);
      expect(screen.getByTestId('optional-result').textContent).toBe('null');
    });

    it('returns context when used inside provider', () => {
      render(
        <RemindersProvider autoStart={false}>
          <OptionalConsumer />
        </RemindersProvider>
      );
      expect(screen.getByTestId('optional-result').textContent).toBe('has-context');
    });
  });

  describe('Cleanup on unmount', () => {
    it('stops service and unsubscribes on unmount', () => {
      const { unmount } = renderWithProvider();

      unmount();

      expect(mocks.mockStop).toHaveBeenCalled();
    });
  });
});
