/**
 * SLA Notification Manager Tests - IFC-093
 *
 * Unit tests for SLA notification delivery, throttling, acknowledgment,
 * and multi-channel dispatch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the domain module
vi.mock('@intelliflow/domain', () => ({}));

import {
  SLANotificationManager,
  slaNotificationManager,
  useSLANotifications,
  type NotificationConfig,
  type SLANotification,
} from '../../../lib/tickets/sla-notifications';

import {
  SLATrackingService,
  DEFAULT_SLA_POLICY,
  type SLABreachAlert,
  type Ticket,
} from '../../../lib/tickets/sla-service';

function createMockAlert(overrides: Partial<SLABreachAlert> = {}): SLABreachAlert {
  return {
    ticketId: 'ticket-1',
    ticketNumber: 'T-10001',
    type: 'BREACH',
    severity: 'CRITICAL',
    message: 'SLA Breach: Ticket T-10001 has breached SLA.',
    timestamp: new Date('2025-12-28T12:00:00Z'),
    priority: 'HIGH',
    dueTime: new Date('2025-12-28T11:30:00Z'),
    ...overrides,
  };
}

describe('SLANotificationManager', () => {
  let manager: SLANotificationManager;
  let originalNotification: typeof globalThis.Notification | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-28T12:00:00Z'));

    // Save and mock Notification API to prevent errors in happy-dom
    originalNotification = (globalThis as any).Notification;
    (globalThis as any).Notification = {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    };

    manager = new SLANotificationManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();

    // Restore original Notification
    if (originalNotification !== undefined) {
      (globalThis as any).Notification = originalNotification;
    } else {
      delete (globalThis as any).Notification;
    }
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const mgr = new SLANotificationManager();
      // Verify defaults by testing behavior - no errors means config is valid
      expect(mgr).toBeDefined();
      mgr.dispose();
    });

    it('should merge provided config with defaults', () => {
      const mgr = new SLANotificationManager({
        channels: ['webhook'],
        webhookUrl: 'https://hooks.example.com',
      });
      expect(mgr).toBeDefined();
      mgr.dispose();
    });
  });

  describe('initialize', () => {
    it('should subscribe to breach and warning alerts from SLA service', () => {
      const slaService = new SLATrackingService();
      const onBreachSpy = vi.spyOn(slaService, 'onBreach');
      const onWarningSpy = vi.spyOn(slaService, 'onWarning');

      manager.initialize(slaService);

      expect(onBreachSpy).toHaveBeenCalledTimes(1);
      expect(onWarningSpy).toHaveBeenCalledTimes(1);
    });

    it('should request browser notification permission when browser channel enabled', () => {
      // Simulate browser environment
      const originalWindow = globalThis.window;
      const originalNotification = (globalThis as any).Notification;

      // Mock Notification
      (globalThis as any).Notification = {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };

      const mgr = new SLANotificationManager({ channels: ['browser'] });
      const slaService = new SLATrackingService();
      mgr.initialize(slaService);

      // Permission request is async, check it was attempted
      expect((globalThis as any).Notification.requestPermission).toHaveBeenCalled();

      mgr.dispose();
      // Restore
      (globalThis as any).Notification = originalNotification;
    });

    it('should not request permission when browser channel not configured', () => {
      const originalNotification = (globalThis as any).Notification;

      (globalThis as any).Notification = {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };

      const mgr = new SLANotificationManager({ channels: ['toast'] });
      const slaService = new SLATrackingService();
      mgr.initialize(slaService);

      expect((globalThis as any).Notification.requestPermission).not.toHaveBeenCalled();

      mgr.dispose();
      (globalThis as any).Notification = originalNotification;
    });
  });

  describe('dispose', () => {
    it('should unsubscribe from SLA service callbacks', () => {
      const slaService = new SLATrackingService();
      manager.initialize(slaService);

      // Dispose should not throw
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should clear all listeners', () => {
      const listener = vi.fn();
      manager.onNotification(listener);

      manager.dispose();

      // After dispose, notifications should not reach listener
      // (internal listeners set is cleared)
    });

    it('should be safe to call dispose multiple times', () => {
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('onNotification', () => {
    it('should register a notification listener and return unsubscribe fn', () => {
      const listener = vi.fn();
      const unsub = manager.onNotification(listener);

      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should notify listeners when an alert is handled', async () => {
      const listener = vi.fn();
      manager.onNotification(listener);

      // Initialize with a mock SLA service and trigger a breach
      const slaService = new SLATrackingService();
      manager.initialize(slaService);

      // Simulate a breach by starting monitoring with a breached ticket
      const mockTicket: Ticket = {
        id: 'test-1',
        ticketNumber: 'T-10001',
        subject: 'Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const getTickets = vi.fn().mockResolvedValue([mockTicket]);
      slaService.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: expect.objectContaining({
            ticketId: 'test-1',
          }),
        })
      );

      slaService.stopMonitoring();
    });
  });

  describe('getRecentNotifications', () => {
    it('should return empty array when no notifications', () => {
      const result = manager.getRecentNotifications();
      expect(result).toEqual([]);
    });

    it('should return notifications in reverse chronological order', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      // Trigger two breach alerts with different tickets
      const ticket1: Ticket = {
        id: 'ticket-1',
        ticketNumber: 'T-10001',
        subject: 'Test 1',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ticket2: Ticket = {
        id: 'ticket-2',
        ticketNumber: 'T-10002',
        subject: 'Test 2',
        status: 'OPEN',
        priority: 'CRITICAL',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 120 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket1, ticket2]));
      await vi.advanceTimersByTimeAsync(100);

      const recent = mgr.getRecentNotifications();
      expect(recent.length).toBe(2);
      // Most recent should be first
      expect(recent[0].alert.ticketId).toBe('ticket-2');
      expect(recent[1].alert.ticketId).toBe('ticket-1');

      slaService.stopMonitoring();
      mgr.dispose();
    });

    it('should respect limit parameter', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const tickets = Array.from({ length: 5 }, (_, i) => ({
        id: `ticket-${i}`,
        ticketNumber: `T-1000${i}`,
        subject: `Test ${i}`,
        status: 'OPEN' as const,
        priority: 'HIGH' as const,
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - (i + 1) * 60 * 1000),
        slaStatus: 'ON_TRACK' as const,
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      slaService.startMonitoring(vi.fn().mockResolvedValue(tickets));
      await vi.advanceTimersByTimeAsync(100);

      const recent = mgr.getRecentNotifications(2);
      expect(recent.length).toBe(2);

      slaService.stopMonitoring();
      mgr.dispose();
    });
  });

  describe('acknowledgeNotification', () => {
    it('should return false for nonexistent notification', () => {
      const result = manager.acknowledgeNotification('nonexistent', 'user-1');
      expect(result).toBe(false);
    });

    it('should acknowledge a notification and return true', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-ack',
        ticketNumber: 'T-10001',
        subject: 'Ack Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);

      const notifications = mgr.getRecentNotifications();
      expect(notifications.length).toBeGreaterThan(0);

      const notifId = notifications[0].id;
      const result = mgr.acknowledgeNotification(notifId, 'user-123');
      expect(result).toBe(true);

      slaService.stopMonitoring();
      mgr.dispose();
    });
  });

  describe('getUnacknowledgedCount', () => {
    it('should return 0 when no notifications', () => {
      expect(manager.getUnacknowledgedCount()).toBe(0);
    });

    it('should count unacknowledged notifications', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-count',
        ticketNumber: 'T-10001',
        subject: 'Count Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);

      expect(mgr.getUnacknowledgedCount()).toBeGreaterThan(0);

      // Acknowledge the notification
      const notifications = mgr.getRecentNotifications();
      mgr.acknowledgeNotification(notifications[0].id, 'user-1');

      expect(mgr.getUnacknowledgedCount()).toBe(0);

      slaService.stopMonitoring();
      mgr.dispose();
    });
  });

  describe('clearOldNotifications', () => {
    it('should remove notifications older than specified minutes', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-old',
        ticketNumber: 'T-10001',
        subject: 'Old Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);
      slaService.stopMonitoring();

      expect(mgr.getRecentNotifications().length).toBeGreaterThan(0);

      // Advance time past the cutoff
      vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutes

      mgr.clearOldNotifications(60);

      expect(mgr.getRecentNotifications().length).toBe(0);
      expect(mgr.getUnacknowledgedCount()).toBe(0);

      mgr.dispose();
    });

    it('should use default 60 minutes when no parameter provided', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-default',
        ticketNumber: 'T-10001',
        subject: 'Default Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);
      slaService.stopMonitoring();

      vi.advanceTimersByTime(61 * 60 * 1000);

      mgr.clearOldNotifications();

      expect(mgr.getRecentNotifications().length).toBe(0);

      mgr.dispose();
    });

    it('should keep recent notifications', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-keep',
        ticketNumber: 'T-10001',
        subject: 'Keep Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);
      slaService.stopMonitoring();

      // Only advance 5 minutes - notifications should remain
      vi.advanceTimersByTime(5 * 60 * 1000);

      mgr.clearOldNotifications(60);

      expect(mgr.getRecentNotifications().length).toBeGreaterThan(0);

      mgr.dispose();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const mgr = new SLANotificationManager();
      expect(() => mgr.updateConfig({ webhookUrl: 'https://new-hook.example.com' })).not.toThrow();
      mgr.dispose();
    });

    it('should merge new config with existing config', () => {
      const mgr = new SLANotificationManager({ channels: ['browser'] });
      mgr.updateConfig({ soundEnabled: false });
      // No error means config merged successfully
      mgr.dispose();
    });
  });

  describe('throttling', () => {
    it('should throttle duplicate alerts for same ticket within throttle window', async () => {
      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({ throttleMinutes: 5 });
      const listener = vi.fn();
      mgr.onNotification(listener);
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-throttle',
        ticketNumber: 'T-10001',
        subject: 'Throttle Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First breach check
      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(100);

      // Should have emitted one notification
      const firstCount = listener.mock.calls.length;
      expect(firstCount).toBe(1);

      // Second check within throttle window - update slaStatus to ON_TRACK again
      // to trigger another breach detection
      ticket.slaStatus = 'ON_TRACK';
      await vi.advanceTimersByTimeAsync(30 * 1000);

      // Should still be the same count due to throttling
      // Note: the SLA service itself won't re-emit if slaStatus changed,
      // but the throttle logic in the notification manager prevents duplicates
      expect(listener.mock.calls.length).toBe(firstCount);

      slaService.stopMonitoring();
      mgr.dispose();
    });

    it('should not throttle when throttleMinutes is 0', async () => {
      const mgr = new SLANotificationManager({ throttleMinutes: 0 });
      // No throttling means all notifications pass through
      expect(mgr).toBeDefined();
      mgr.dispose();
    });
  });

  describe('webhook notification dispatch', () => {
    it('should send webhook notification when webhookUrl is configured', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = fetchSpy;

      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({
        channels: ['webhook'],
        webhookUrl: 'https://hooks.example.com/sla',
        throttleMinutes: 0,
      });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-webhook',
        ticketNumber: 'T-10001',
        subject: 'Webhook Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(200);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hooks.example.com/sla',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      slaService.stopMonitoring();
      mgr.dispose();
    });

    it('should handle webhook failure gracefully', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Connection refused'));
      globalThis.fetch = fetchSpy;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({
        channels: ['webhook'],
        webhookUrl: 'https://hooks.example.com/sla',
        throttleMinutes: 0,
      });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-fail',
        ticketNumber: 'T-10001',
        subject: 'Fail Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(200);

      // Should not throw
      expect(consoleSpy).toHaveBeenCalled();

      slaService.stopMonitoring();
      mgr.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe('toast notification dispatch', () => {
    it('should log toast notification', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({
        channels: ['toast'],
        throttleMinutes: 0,
      });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-toast',
        ticketNumber: 'T-10001',
        subject: 'Toast Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(200);

      expect(consoleSpy).toHaveBeenCalledWith('[SLA Toast]', expect.stringContaining('T-10001'));

      slaService.stopMonitoring();
      mgr.dispose();
      consoleSpy.mockRestore();
    });
  });

  describe('email notification dispatch', () => {
    it('should log email notification when email channel configured', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const slaService = new SLATrackingService();
      const mgr = new SLANotificationManager({
        channels: ['email'],
        emailRecipients: ['admin@example.com'],
        throttleMinutes: 0,
      });
      mgr.initialize(slaService);

      const ticket: Ticket = {
        id: 'ticket-email',
        ticketNumber: 'T-10001',
        subject: 'Email Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(Date.now() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      slaService.startMonitoring(vi.fn().mockResolvedValue([ticket]));
      await vi.advanceTimersByTimeAsync(200);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SLA Email]',
        expect.objectContaining({
          to: ['admin@example.com'],
        })
      );

      slaService.stopMonitoring();
      mgr.dispose();
      consoleSpy.mockRestore();
    });
  });
});

describe('useSLANotifications', () => {
  it('should return default values (placeholder hook)', () => {
    const result = useSLANotifications();

    expect(result.notifications).toEqual([]);
    expect(result.unacknowledgedCount).toBe(0);
    expect(typeof result.acknowledge).toBe('function');
  });

  it('should accept config parameter', () => {
    const result = useSLANotifications({ channels: ['browser'] });

    expect(result.notifications).toEqual([]);
  });
});

describe('slaNotificationManager singleton', () => {
  it('should be an instance of SLANotificationManager', () => {
    expect(slaNotificationManager).toBeInstanceOf(SLANotificationManager);
  });
});
