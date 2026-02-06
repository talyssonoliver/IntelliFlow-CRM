/**
 * SLA Service Tests - IFC-093
 *
 * Unit tests for SLA tracking service, timer calculations, breach detection,
 * badge colors, and timer icons.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the domain module before importing sla-service
vi.mock('@intelliflow/domain', () => ({
  // Types are only used as type imports, so we just need the module to resolve
}));

import {
  SLATrackingService,
  DEFAULT_SLA_POLICY,
  type Ticket,
} from '../../../lib/tickets/sla-service';

describe('SLATrackingService', () => {
  let service: SLATrackingService;
  const now = new Date('2025-12-28T12:00:00Z');

  beforeEach(() => {
    service = new SLATrackingService();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    service.stopMonitoring();
    vi.useRealTimers();
  });

  describe('getResponseMinutes', () => {
    it('should return correct minutes for CRITICAL priority', () => {
      expect(service.getResponseMinutes('CRITICAL', DEFAULT_SLA_POLICY)).toBe(15);
    });

    it('should return correct minutes for HIGH priority', () => {
      expect(service.getResponseMinutes('HIGH', DEFAULT_SLA_POLICY)).toBe(60);
    });

    it('should return correct minutes for MEDIUM priority', () => {
      expect(service.getResponseMinutes('MEDIUM', DEFAULT_SLA_POLICY)).toBe(240);
    });

    it('should return correct minutes for LOW priority', () => {
      expect(service.getResponseMinutes('LOW', DEFAULT_SLA_POLICY)).toBe(480);
    });

    it('should default to MEDIUM for unknown priority', () => {
      expect(service.getResponseMinutes('UNKNOWN' as any, DEFAULT_SLA_POLICY)).toBe(240);
    });
  });

  describe('getResolutionMinutes', () => {
    it('should return correct minutes for CRITICAL priority', () => {
      expect(service.getResolutionMinutes('CRITICAL', DEFAULT_SLA_POLICY)).toBe(120);
    });

    it('should return correct minutes for HIGH priority', () => {
      expect(service.getResolutionMinutes('HIGH', DEFAULT_SLA_POLICY)).toBe(480);
    });

    it('should return correct minutes for MEDIUM priority', () => {
      expect(service.getResolutionMinutes('MEDIUM', DEFAULT_SLA_POLICY)).toBe(1440);
    });

    it('should return correct minutes for LOW priority', () => {
      expect(service.getResolutionMinutes('LOW', DEFAULT_SLA_POLICY)).toBe(4320);
    });

    it('should default to MEDIUM for unknown priority', () => {
      expect(service.getResolutionMinutes('UNKNOWN' as any, DEFAULT_SLA_POLICY)).toBe(1440);
    });
  });

  describe('getResponseDeadline', () => {
    it('should calculate deadline based on creation time and priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'CRITICAL', DEFAULT_SLA_POLICY);
      expect(deadline.getTime()).toBe(createdAt.getTime() + 15 * 60 * 1000);
    });

    it('should produce correct deadline for LOW priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'LOW', DEFAULT_SLA_POLICY);
      expect(deadline.getTime()).toBe(createdAt.getTime() + 480 * 60 * 1000);
    });
  });

  describe('getResolutionDeadline', () => {
    it('should calculate resolution deadline based on creation time and priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResolutionDeadline(createdAt, 'HIGH', DEFAULT_SLA_POLICY);
      expect(deadline.getTime()).toBe(createdAt.getTime() + 480 * 60 * 1000);
    });
  });

  describe('calculateSLATimer', () => {
    it('should return ON_TRACK when plenty of time remaining', () => {
      // Need > 288 minutes remaining to exceed the 25% warning threshold
      // because getTotalSLAMinutes estimates total as (now - dueTime + 24h)
      const dueTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('ON_TRACK');
      expect(result.isBreached).toBe(false);
      expect(result.isAtRisk).toBe(false);
      expect(result.remainingMinutes).toBe(360);
      expect(result.breachTime).toEqual(dueTime);
    });

    it('should return AT_RISK when approaching warning threshold', () => {
      const dueTime = new Date(now.getTime() + 10 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('AT_RISK');
      expect(result.isBreached).toBe(false);
      expect(result.isAtRisk).toBe(true);
    });

    it('should return BREACHED when past due', () => {
      const dueTime = new Date(now.getTime() - 30 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('BREACHED');
      expect(result.isBreached).toBe(true);
      expect(result.remainingMinutes).toBe(-30);
      expect(result.breachTime).toBeUndefined();
    });

    it('should return PAUSED for WAITING_ON_CUSTOMER', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'WAITING_ON_CUSTOMER', now);

      expect(result.status).toBe('PAUSED');
      expect(result.remainingFormatted).toBe('Paused');
      expect(result.percentRemaining).toBe(100);
    });

    it('should return PAUSED for WAITING_ON_THIRD_PARTY', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'WAITING_ON_THIRD_PARTY', now);

      expect(result.status).toBe('PAUSED');
    });

    it('should return MET for RESOLVED tickets', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'RESOLVED', now);

      expect(result.status).toBe('MET');
      expect(result.remainingFormatted).toBe('Completed');
    });

    it('should return MET for CLOSED tickets', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'CLOSED', now);

      expect(result.status).toBe('MET');
    });

    it('should clamp percentRemaining to 0 for breached tickets', () => {
      const dueTime = new Date(now.getTime() - 30 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.percentRemaining).toBe(0);
    });

    it('should use current time when now parameter is not provided', () => {
      const dueTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN');

      expect(result.status).toBe('ON_TRACK');
      expect(result.remainingMinutes).toBe(360);
    });
  });

  describe('formatRemainingTime', () => {
    it('should format hours and minutes with padding', () => {
      expect(service.formatRemainingTime(125)).toBe('02h 05m');
    });

    it('should format minutes only when under an hour', () => {
      expect(service.formatRemainingTime(45)).toBe('45m');
    });

    it('should format negative time with minus sign', () => {
      expect(service.formatRemainingTime(-30)).toBe('-30m');
    });

    it('should format negative hours correctly', () => {
      expect(service.formatRemainingTime(-134)).toBe('-02h 14m');
    });

    it('should pad single digit minutes', () => {
      expect(service.formatRemainingTime(5)).toBe('05m');
    });

    it('should format zero minutes', () => {
      expect(service.formatRemainingTime(0)).toBe('00m');
    });

    it('should format exactly 60 minutes as hours', () => {
      expect(service.formatRemainingTime(60)).toBe('01h 00m');
    });
  });

  describe('generateBreachAlert', () => {
    const createMockTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
      id: 'ticket-1',
      ticketNumber: 'T-10001',
      subject: 'Test Ticket',
      status: 'OPEN',
      priority: 'HIGH',
      slaPolicy: DEFAULT_SLA_POLICY,
      slaResolutionDue: new Date(now.getTime() - 30 * 60 * 1000),
      slaStatus: 'BREACHED',
      contactName: 'Test User',
      contactEmail: 'test@example.com',
      createdAt: new Date(now.getTime() - 120 * 60 * 1000),
      updatedAt: now,
      ...overrides,
    });

    it('should generate BREACH alert with correct fields', () => {
      const ticket = createMockTicket();
      const alert = service.generateBreachAlert(ticket, false);

      expect(alert.ticketId).toBe('ticket-1');
      expect(alert.ticketNumber).toBe('T-10001');
      expect(alert.type).toBe('BREACH');
      expect(alert.priority).toBe('HIGH');
      expect(alert.timestamp).toBeInstanceOf(Date);
      expect(alert.message).toContain('SLA Breach');
      expect(alert.message).toContain('T-10001');
    });

    it('should generate WARNING alert when isWarning is true', () => {
      const ticket = createMockTicket({
        slaResolutionDue: new Date(now.getTime() + 10 * 60 * 1000),
        slaStatus: 'AT_RISK',
      });
      const alert = service.generateBreachAlert(ticket, true);

      expect(alert.type).toBe('WARNING');
      expect(alert.message).toContain('SLA Warning');
    });

    it('should set CRITICAL severity for CRITICAL priority breach', () => {
      const ticket = createMockTicket({ priority: 'CRITICAL' });
      const alert = service.generateBreachAlert(ticket, false);
      expect(alert.severity).toBe('CRITICAL');
    });

    it('should set WARNING severity for HIGH priority breach', () => {
      const ticket = createMockTicket({ priority: 'HIGH' });
      const alert = service.generateBreachAlert(ticket, false);
      expect(alert.severity).toBe('WARNING');
    });

    it('should set WARNING severity for CRITICAL/HIGH priority warning', () => {
      const ticket = createMockTicket({ priority: 'CRITICAL' });
      const alert = service.generateBreachAlert(ticket, true);
      expect(alert.severity).toBe('WARNING');
    });

    it('should set INFO severity for MEDIUM/LOW priority warning', () => {
      const ticket = createMockTicket({ priority: 'MEDIUM' });
      const alert = service.generateBreachAlert(ticket, true);
      expect(alert.severity).toBe('INFO');
    });

    it('should include assigneeId when present', () => {
      const ticket = createMockTicket({ assigneeId: 'user-123' });
      const alert = service.generateBreachAlert(ticket, false);
      expect(alert.assigneeId).toBe('user-123');
    });

    it('should use current date for dueTime when slaResolutionDue not set', () => {
      const ticket = createMockTicket({ slaResolutionDue: undefined });
      const alert = service.generateBreachAlert(ticket, false);
      expect(alert.dueTime).toBeInstanceOf(Date);
    });
  });

  describe('onBreach / onWarning callbacks', () => {
    it('should register and unregister breach callbacks', () => {
      const callback = vi.fn();
      const unregister = service.onBreach(callback);
      expect(typeof unregister).toBe('function');
      unregister();
    });

    it('should register and unregister warning callbacks', () => {
      const callback = vi.fn();
      const unregister = service.onWarning(callback);
      expect(typeof unregister).toBe('function');
      unregister();
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('should call getTickets immediately on start', async () => {
      const getTickets = vi.fn().mockResolvedValue([]);
      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);
      expect(getTickets).toHaveBeenCalledTimes(1);
    });

    it('should check every 30 seconds', async () => {
      const getTickets = vi.fn().mockResolvedValue([]);
      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);
      expect(getTickets).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30 * 1000);
      expect(getTickets).toHaveBeenCalledTimes(2);
    });

    it('should stop after stopMonitoring', async () => {
      const getTickets = vi.fn().mockResolvedValue([]);
      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);
      service.stopMonitoring();
      await vi.advanceTimersByTimeAsync(30 * 1000);
      expect(getTickets).toHaveBeenCalledTimes(1);
    });

    it('should emit breach alert for newly breached ticket', async () => {
      const mockTicket: Ticket = {
        id: 'test-breach',
        ticketNumber: 'T-10001',
        subject: 'Breached',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(now.getTime() - 60 * 1000),
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: now,
        updatedAt: now,
      };
      const getTickets = vi.fn().mockResolvedValue([mockTicket]);
      const breachCallback = vi.fn();
      service.onBreach(breachCallback);
      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);
      expect(breachCallback).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 'test-breach', type: 'BREACH' })
      );
    });

    it('should handle errors from getTickets gracefully', async () => {
      const getTickets = vi.fn().mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should stopMonitoring safely when not monitoring', () => {
      expect(() => service.stopMonitoring()).not.toThrow();
    });
  });

  describe('getSLABadgeColor', () => {
    it('should return emerald for ON_TRACK', () => {
      const c = service.getSLABadgeColor('ON_TRACK');
      expect(c.bg).toContain('emerald');
      expect(c.text).toContain('emerald');
      expect(c.border).toContain('emerald');
      expect(c.darkBg).toContain('emerald');
      expect(c.darkText).toContain('emerald');
      expect(c.darkBorder).toContain('emerald');
    });

    it('should return yellow for AT_RISK', () => {
      expect(service.getSLABadgeColor('AT_RISK').bg).toContain('yellow');
    });

    it('should return red for BREACHED', () => {
      expect(service.getSLABadgeColor('BREACHED').bg).toContain('red');
    });

    it('should return slate for PAUSED', () => {
      expect(service.getSLABadgeColor('PAUSED').bg).toContain('slate');
    });

    it('should return blue for MET', () => {
      expect(service.getSLABadgeColor('MET').bg).toContain('blue');
    });

    it('should return slate for unknown status', () => {
      expect(service.getSLABadgeColor('UNKNOWN' as any).bg).toContain('slate');
    });
  });

  describe('getSLATimerIcon', () => {
    it('should return schedule for ON_TRACK', () => {
      expect(service.getSLATimerIcon('ON_TRACK')).toBe('schedule');
    });

    it('should return timelapse for AT_RISK', () => {
      expect(service.getSLATimerIcon('AT_RISK')).toBe('timelapse');
    });

    it('should return timer_off for BREACHED', () => {
      expect(service.getSLATimerIcon('BREACHED')).toBe('timer_off');
    });

    it('should return pause_circle for PAUSED', () => {
      expect(service.getSLATimerIcon('PAUSED')).toBe('pause_circle');
    });

    it('should return check_circle for MET', () => {
      expect(service.getSLATimerIcon('MET')).toBe('check_circle');
    });

    it('should return schedule as default', () => {
      expect(service.getSLATimerIcon('UNKNOWN' as any)).toBe('schedule');
    });
  });

  describe('DEFAULT_SLA_POLICY', () => {
    it('should have correct response times', () => {
      expect(DEFAULT_SLA_POLICY.criticalResponseMinutes).toBe(15);
      expect(DEFAULT_SLA_POLICY.highResponseMinutes).toBe(60);
      expect(DEFAULT_SLA_POLICY.mediumResponseMinutes).toBe(240);
      expect(DEFAULT_SLA_POLICY.lowResponseMinutes).toBe(480);
    });

    it('should have correct resolution times', () => {
      expect(DEFAULT_SLA_POLICY.criticalResolutionMinutes).toBe(120);
      expect(DEFAULT_SLA_POLICY.highResolutionMinutes).toBe(480);
      expect(DEFAULT_SLA_POLICY.mediumResolutionMinutes).toBe(1440);
      expect(DEFAULT_SLA_POLICY.lowResolutionMinutes).toBe(4320);
    });

    it('should have 25% warning threshold', () => {
      expect(DEFAULT_SLA_POLICY.warningThresholdPercent).toBe(25);
    });

    it('should have id and name', () => {
      expect(DEFAULT_SLA_POLICY.id).toBe('default');
      expect(DEFAULT_SLA_POLICY.name).toBe('Standard SLA');
    });
  });
});
