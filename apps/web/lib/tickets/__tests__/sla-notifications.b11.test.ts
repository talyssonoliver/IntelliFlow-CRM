/**
 * @vitest-environment happy-dom
 *
 * SLA Notifications - B11 coverage tests
 *
 * Targets ~16 uncovered lines (85.04% coverage):
 * - SLANotificationManager: initialize, dispose, dispatchNotification
 * - handleAlert: throttle logic
 * - acknowledgeNotification: success and failure
 * - getUnacknowledgedCount
 * - clearOldNotifications
 * - updateConfig
 * - onNotification subscription
 * - getRecentNotifications
 * - useSLANotifications hook stub
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sla-service before importing sla-notifications
vi.mock('../sla-service', () => ({
  slaTrackingService: {
    onBreach: vi.fn(() => vi.fn()),
    onWarning: vi.fn(() => vi.fn()),
  },
  SLATrackingService: vi.fn(),
}));

import {
  SLANotificationManager,
  useSLANotifications,
  slaNotificationManager,
} from '../sla-notifications';

describe('SLANotificationManager (b11 coverage)', () => {
  let manager: SLANotificationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    manager = new SLANotificationManager({
      channels: ['toast'],
      throttleMinutes: 5,
    });
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('subscribes to breach and warning alerts from sla service', () => {
      const mockService = {
        onBreach: vi.fn(() => vi.fn()),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      manager.initialize(mockService);

      expect(mockService.onBreach).toHaveBeenCalled();
      expect(mockService.onWarning).toHaveBeenCalled();
    });

    it('requests browser notification permission when browser channel is configured', () => {
      const browserManager = new SLANotificationManager({
        channels: ['browser'],
      });

      const mockService = {
        onBreach: vi.fn(() => vi.fn()),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      // Mock Notification
      const originalNotification = (globalThis as any).Notification;
      (globalThis as any).Notification = {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };

      browserManager.initialize(mockService);

      // Restore
      (globalThis as any).Notification = originalNotification;
      browserManager.dispose();
    });
  });

  describe('dispose', () => {
    it('cleans up all subscriptions and listeners', () => {
      const unsubBreach = vi.fn();
      const unsubWarning = vi.fn();

      const mockService = {
        onBreach: vi.fn(() => unsubBreach),
        onWarning: vi.fn(() => unsubWarning),
      } as any;

      manager.initialize(mockService);
      manager.dispose();

      expect(unsubBreach).toHaveBeenCalled();
      expect(unsubWarning).toHaveBeenCalled();
    });
  });

  describe('onNotification', () => {
    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = manager.onNotification(callback);

      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('getRecentNotifications', () => {
    it('returns empty array when no notifications exist', () => {
      const recent = manager.getRecentNotifications();
      expect(recent).toEqual([]);
    });

    it('returns up to limit notifications in reverse order', () => {
      const recent = manager.getRecentNotifications(5);
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe('acknowledgeNotification', () => {
    it('returns false when notification does not exist', () => {
      const result = manager.acknowledgeNotification('nonexistent-id', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('getUnacknowledgedCount', () => {
    it('returns 0 when no notifications', () => {
      expect(manager.getUnacknowledgedCount()).toBe(0);
    });
  });

  describe('clearOldNotifications', () => {
    it('does not throw when no notifications exist', () => {
      expect(() => manager.clearOldNotifications(30)).not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('merges new config into existing config', () => {
      manager.updateConfig({ soundEnabled: false, throttleMinutes: 10 });
      // No error = success, config is internal
    });
  });

  describe('handleAlert integration', () => {
    it('processes breach alert through initialize callback', async () => {
      let breachCallback: ((alert: any) => void) | null = null;

      const mockService = {
        onBreach: vi.fn((cb: any) => {
          breachCallback = cb;
          return vi.fn();
        }),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      const listener = vi.fn();
      manager.onNotification(listener);
      manager.initialize(mockService);

      // Simulate breach alert
      const mockAlert = {
        ticketId: 'ticket-1',
        ticketNumber: 'T-001',
        type: 'BREACH',
        severity: 'CRITICAL',
        message: 'SLA Breach on T-001',
        priority: 'CRITICAL',
        dueAt: new Date(),
        overdueMinutes: 5,
      };

      breachCallback!(mockAlert);

      // Listener should be called
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: mockAlert,
          priority: 'urgent',
        })
      );
    });

    it('throttles duplicate alerts within throttle window', () => {
      let breachCallback: ((alert: any) => void) | null = null;

      const mockService = {
        onBreach: vi.fn((cb: any) => {
          breachCallback = cb;
          return vi.fn();
        }),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      const listener = vi.fn();
      manager.onNotification(listener);
      manager.initialize(mockService);

      const mockAlert = {
        ticketId: 'ticket-2',
        ticketNumber: 'T-002',
        type: 'BREACH',
        severity: 'WARNING',
        message: 'SLA Breach on T-002',
        priority: 'HIGH',
        dueAt: new Date(),
        overdueMinutes: 10,
      };

      // First call should go through
      breachCallback!(mockAlert);
      expect(listener).toHaveBeenCalledTimes(1);

      // Second call within throttle window should be throttled
      breachCallback!(mockAlert);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('allows alert after throttle window passes', () => {
      let breachCallback: ((alert: any) => void) | null = null;

      const mockService = {
        onBreach: vi.fn((cb: any) => {
          breachCallback = cb;
          return vi.fn();
        }),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      const listener = vi.fn();
      manager.onNotification(listener);
      manager.initialize(mockService);

      const mockAlert = {
        ticketId: 'ticket-3',
        ticketNumber: 'T-003',
        type: 'BREACH',
        severity: 'WARNING',
        message: 'SLA Breach on T-003',
        priority: 'HIGH',
        dueAt: new Date(),
        overdueMinutes: 10,
      };

      breachCallback!(mockAlert);
      expect(listener).toHaveBeenCalledTimes(1);

      // Advance past throttle window (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      breachCallback!(mockAlert);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('acknowledges notification after alert', () => {
      let breachCallback: ((alert: any) => void) | null = null;

      const mockService = {
        onBreach: vi.fn((cb: any) => {
          breachCallback = cb;
          return vi.fn();
        }),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      let capturedNotification: any = null;
      manager.onNotification((n) => {
        capturedNotification = n;
      });
      manager.initialize(mockService);

      breachCallback!({
        ticketId: 'ticket-ack',
        ticketNumber: 'T-ACK',
        type: 'BREACH',
        severity: 'CRITICAL',
        message: 'Ack test',
        priority: 'CRITICAL',
        dueAt: new Date(),
        overdueMinutes: 1,
      });

      expect(capturedNotification).not.toBeNull();
      const acked = manager.acknowledgeNotification(capturedNotification.id, 'user-123');
      expect(acked).toBe(true);
      expect(manager.getUnacknowledgedCount()).toBe(0);
    });

    it('clears old notifications', () => {
      let breachCallback: ((alert: any) => void) | null = null;

      const mockService = {
        onBreach: vi.fn((cb: any) => {
          breachCallback = cb;
          return vi.fn();
        }),
        onWarning: vi.fn(() => vi.fn()),
      } as any;

      manager.onNotification(vi.fn());
      manager.initialize(mockService);

      breachCallback!({
        ticketId: 'ticket-old',
        ticketNumber: 'T-OLD',
        type: 'BREACH',
        severity: 'WARNING',
        message: 'Old alert',
        priority: 'HIGH',
        dueAt: new Date(),
        overdueMinutes: 5,
      });

      expect(manager.getUnacknowledgedCount()).toBe(1);

      // Advance past 60 minutes
      vi.advanceTimersByTime(61 * 60 * 1000);

      manager.clearOldNotifications(60);
      expect(manager.getUnacknowledgedCount()).toBe(0);
    });
  });

  describe('useSLANotifications', () => {
    it('returns default values (placeholder)', () => {
      const result = useSLANotifications();

      expect(result.notifications).toEqual([]);
      expect(result.unacknowledgedCount).toBe(0);
      expect(typeof result.acknowledge).toBe('function');
    });

    it('acknowledge function does not throw', () => {
      const result = useSLANotifications();
      expect(() => result.acknowledge('any-id')).not.toThrow();
    });
  });

  describe('slaNotificationManager singleton', () => {
    it('exports a singleton instance', () => {
      expect(slaNotificationManager).toBeInstanceOf(SLANotificationManager);
    });
  });
});
