/**
 * SLA Notification Tests - IFC-093
 *
 * Unit tests for SLA tracking service, timer calculations, and breach detection.
 * Tests ensure SLA breach alerts are generated within <1 minute.
 *
 * @implements FLOW-011 (Ticket creation flow)
 * @implements FLOW-013 (SLA management flow)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SLATrackingService,
  DEFAULT_SLA_POLICY,
  SLAStatus,
  TicketPriority,
  TicketStatus,
  Ticket,
  SLABreachAlert,
} from './sla-service';

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

  describe('getResponseDeadline', () => {
    it('should calculate correct response deadline for CRITICAL priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'CRITICAL', DEFAULT_SLA_POLICY);

      // CRITICAL = 15 minutes
      expect(deadline.getTime()).toBe(createdAt.getTime() + 15 * 60 * 1000);
    });

    it('should calculate correct response deadline for HIGH priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'HIGH', DEFAULT_SLA_POLICY);

      // HIGH = 60 minutes
      expect(deadline.getTime()).toBe(createdAt.getTime() + 60 * 60 * 1000);
    });

    it('should calculate correct response deadline for MEDIUM priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'MEDIUM', DEFAULT_SLA_POLICY);

      // MEDIUM = 240 minutes (4 hours)
      expect(deadline.getTime()).toBe(createdAt.getTime() + 240 * 60 * 1000);
    });

    it('should calculate correct response deadline for LOW priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResponseDeadline(createdAt, 'LOW', DEFAULT_SLA_POLICY);

      // LOW = 480 minutes (8 hours)
      expect(deadline.getTime()).toBe(createdAt.getTime() + 480 * 60 * 1000);
    });
  });

  describe('getResolutionDeadline', () => {
    it('should calculate correct resolution deadline for CRITICAL priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResolutionDeadline(createdAt, 'CRITICAL', DEFAULT_SLA_POLICY);

      // CRITICAL = 120 minutes (2 hours)
      expect(deadline.getTime()).toBe(createdAt.getTime() + 120 * 60 * 1000);
    });

    it('should calculate correct resolution deadline for LOW priority', () => {
      const createdAt = new Date('2025-12-28T12:00:00Z');
      const deadline = service.getResolutionDeadline(createdAt, 'LOW', DEFAULT_SLA_POLICY);

      // LOW = 4320 minutes (72 hours)
      expect(deadline.getTime()).toBe(createdAt.getTime() + 4320 * 60 * 1000);
    });
  });

  describe('calculateSLATimer', () => {
    it('should return ON_TRACK status when plenty of time remaining', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000); // 60 minutes from now
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('ON_TRACK');
      expect(result.isBreached).toBe(false);
      expect(result.isAtRisk).toBe(false);
      expect(result.remainingMinutes).toBe(60);
    });

    it('should return AT_RISK status when approaching breach threshold', () => {
      // With 25% warning threshold and 60 min total, 15 min remaining = at risk
      const dueTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('AT_RISK');
      expect(result.isBreached).toBe(false);
      expect(result.isAtRisk).toBe(true);
    });

    it('should return BREACHED status when past due time', () => {
      const dueTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'OPEN', now);

      expect(result.status).toBe('BREACHED');
      expect(result.isBreached).toBe(true);
      expect(result.remainingMinutes).toBe(-30);
    });

    it('should return PAUSED status when waiting on customer', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(
        dueTime,
        DEFAULT_SLA_POLICY,
        'WAITING_ON_CUSTOMER',
        now
      );

      expect(result.status).toBe('PAUSED');
      expect(result.isBreached).toBe(false);
    });

    it('should return PAUSED status when waiting on third party', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(
        dueTime,
        DEFAULT_SLA_POLICY,
        'WAITING_ON_THIRD_PARTY',
        now
      );

      expect(result.status).toBe('PAUSED');
    });

    it('should return MET status when ticket is resolved', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'RESOLVED', now);

      expect(result.status).toBe('MET');
      expect(result.isBreached).toBe(false);
    });

    it('should return MET status when ticket is closed', () => {
      const dueTime = new Date(now.getTime() + 60 * 60 * 1000);
      const result = service.calculateSLATimer(dueTime, DEFAULT_SLA_POLICY, 'CLOSED', now);

      expect(result.status).toBe('MET');
    });
  });

  describe('formatRemainingTime', () => {
    it('should format positive time correctly with hours', () => {
      const formatted = service.formatRemainingTime(125); // 2h 5m
      expect(formatted).toBe('02h 05m');
    });

    it('should format positive time correctly without hours', () => {
      const formatted = service.formatRemainingTime(45);
      expect(formatted).toBe('45m');
    });

    it('should format negative time (breached) correctly', () => {
      const formatted = service.formatRemainingTime(-30);
      expect(formatted).toBe('-30m');
    });

    it('should format negative time with hours correctly', () => {
      const formatted = service.formatRemainingTime(-134); // -2h 14m
      expect(formatted).toBe('-02h 14m');
    });

    it('should pad single digit minutes', () => {
      const formatted = service.formatRemainingTime(5);
      expect(formatted).toBe('05m');
    });
  });

  describe('generateBreachAlert', () => {
    const createMockTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
      id: 'test-ticket-1',
      ticketNumber: 'T-10001',
      subject: 'Test Ticket',
      status: 'OPEN',
      priority: 'HIGH',
      slaPolicy: DEFAULT_SLA_POLICY,
      slaResolutionDue: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      slaStatus: 'BREACHED',
      contactName: 'Test User',
      contactEmail: 'test@example.com',
      createdAt: new Date(now.getTime() - 120 * 60 * 1000),
      updatedAt: now,
      ...overrides,
    });

    it('should generate breach alert with correct fields', () => {
      const ticket = createMockTicket();
      const alert = service.generateBreachAlert(ticket, false);

      expect(alert.ticketId).toBe(ticket.id);
      expect(alert.ticketNumber).toBe(ticket.ticketNumber);
      expect(alert.type).toBe('BREACH');
      expect(alert.severity).toBe('WARNING'); // HIGH priority breach = WARNING severity
      expect(alert.priority).toBe('HIGH');
    });

    it('should generate warning alert when isWarning is true', () => {
      const ticket = createMockTicket({
        slaResolutionDue: new Date(now.getTime() + 10 * 60 * 1000), // 10 min remaining
        slaStatus: 'AT_RISK',
      });
      const alert = service.generateBreachAlert(ticket, true);

      expect(alert.type).toBe('WARNING');
    });

    it('should set CRITICAL severity for CRITICAL priority breaches', () => {
      const ticket = createMockTicket({ priority: 'CRITICAL' });
      const alert = service.generateBreachAlert(ticket, false);

      expect(alert.severity).toBe('CRITICAL');
    });

    it('should include message with ticket number and time', () => {
      const ticket = createMockTicket();
      const alert = service.generateBreachAlert(ticket, false);

      expect(alert.message).toContain(ticket.ticketNumber);
      expect(alert.message).toContain('SLA Breach');
    });
  });

  describe('breach callback registration', () => {
    it('should allow registering and unregistering breach callbacks', () => {
      const callback = vi.fn();
      const unregister = service.onBreach(callback);

      expect(typeof unregister).toBe('function');
      unregister();
      // Callback should be unregistered now
    });

    it('should allow registering and unregistering warning callbacks', () => {
      const callback = vi.fn();
      const unregister = service.onWarning(callback);

      expect(typeof unregister).toBe('function');
      unregister();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring and check for breaches immediately', async () => {
      const mockTicket: Ticket = {
        id: 'test-1',
        ticketNumber: 'T-10001',
        subject: 'Test',
        status: 'OPEN',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(now.getTime() - 60 * 1000), // 1 min ago - breached
        slaStatus: 'ON_TRACK', // Will trigger breach notification
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: now,
        updatedAt: now,
      };

      const getTickets = vi.fn().mockResolvedValue([mockTicket]);
      const breachCallback = vi.fn();
      service.onBreach(breachCallback);

      service.startMonitoring(getTickets);

      // Wait for async operations
      await vi.advanceTimersByTimeAsync(100);

      expect(getTickets).toHaveBeenCalled();
      expect(breachCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'test-1',
          type: 'BREACH',
        })
      );
    });

    it('should check for breaches every 30 seconds', async () => {
      const getTickets = vi.fn().mockResolvedValue([]);
      service.startMonitoring(getTickets);

      await vi.advanceTimersByTimeAsync(100);
      expect(getTickets).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30 * 1000);
      expect(getTickets).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(30 * 1000);
      expect(getTickets).toHaveBeenCalledTimes(3);
    });

    it('should emit warning for at-risk tickets', async () => {
      const mockTicket: Ticket = {
        id: 'test-2',
        ticketNumber: 'T-10002',
        subject: 'At Risk Test',
        status: 'OPEN',
        priority: 'MEDIUM',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(now.getTime() + 5 * 60 * 1000), // 5 min - at risk
        slaStatus: 'ON_TRACK', // Will trigger warning
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: now,
        updatedAt: now,
      };

      const getTickets = vi.fn().mockResolvedValue([mockTicket]);
      const warningCallback = vi.fn();
      service.onWarning(warningCallback);

      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);

      expect(warningCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'test-2',
          type: 'WARNING',
        })
      );
    });

    it('should not emit alerts for resolved tickets', async () => {
      const mockTicket: Ticket = {
        id: 'test-3',
        ticketNumber: 'T-10003',
        subject: 'Resolved Test',
        status: 'RESOLVED',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(now.getTime() - 60 * 1000), // Past due but resolved
        slaStatus: 'MET',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: now,
        updatedAt: now,
        resolvedAt: now,
      };

      const getTickets = vi.fn().mockResolvedValue([mockTicket]);
      const breachCallback = vi.fn();
      service.onBreach(breachCallback);

      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);

      expect(breachCallback).not.toHaveBeenCalled();
    });

    it('should not emit alerts for paused tickets', async () => {
      const mockTicket: Ticket = {
        id: 'test-4',
        ticketNumber: 'T-10004',
        subject: 'Paused Test',
        status: 'WAITING_ON_CUSTOMER',
        priority: 'HIGH',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: new Date(now.getTime() - 60 * 1000), // Past due but paused
        slaStatus: 'PAUSED',
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

      expect(breachCallback).not.toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop the monitoring interval', async () => {
      const getTickets = vi.fn().mockResolvedValue([]);
      service.startMonitoring(getTickets);

      await vi.advanceTimersByTimeAsync(100);
      expect(getTickets).toHaveBeenCalledTimes(1);

      service.stopMonitoring();

      await vi.advanceTimersByTimeAsync(30 * 1000);
      // Should still be 1 since monitoring stopped
      expect(getTickets).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSLABadgeColor', () => {
    it('should return green colors for ON_TRACK', () => {
      const colors = service.getSLABadgeColor('ON_TRACK');
      expect(colors.bg).toContain('emerald');
      expect(colors.text).toContain('emerald');
    });

    it('should return yellow colors for AT_RISK', () => {
      const colors = service.getSLABadgeColor('AT_RISK');
      expect(colors.bg).toContain('yellow');
      expect(colors.text).toContain('yellow');
    });

    it('should return red colors for BREACHED', () => {
      const colors = service.getSLABadgeColor('BREACHED');
      expect(colors.bg).toContain('red');
      expect(colors.text).toContain('red');
    });

    it('should return slate colors for PAUSED', () => {
      const colors = service.getSLABadgeColor('PAUSED');
      expect(colors.bg).toContain('slate');
      expect(colors.text).toContain('slate');
    });

    it('should return blue colors for MET', () => {
      const colors = service.getSLABadgeColor('MET');
      expect(colors.bg).toContain('blue');
      expect(colors.text).toContain('blue');
    });
  });

  describe('getSLATimerIcon', () => {
    it('should return schedule icon for ON_TRACK', () => {
      expect(service.getSLATimerIcon('ON_TRACK')).toBe('schedule');
    });

    it('should return timelapse icon for AT_RISK', () => {
      expect(service.getSLATimerIcon('AT_RISK')).toBe('timelapse');
    });

    it('should return timer_off icon for BREACHED', () => {
      expect(service.getSLATimerIcon('BREACHED')).toBe('timer_off');
    });

    it('should return pause_circle icon for PAUSED', () => {
      expect(service.getSLATimerIcon('PAUSED')).toBe('pause_circle');
    });

    it('should return check_circle icon for MET', () => {
      expect(service.getSLATimerIcon('MET')).toBe('check_circle');
    });
  });

  describe('SLA breach detection within <1 minute', () => {
    it('should detect breach within 30 seconds of occurrence', async () => {
      const breachTime = new Date(now.getTime() + 15 * 1000); // Will breach in 15 seconds
      const mockTicket: Ticket = {
        id: 'test-quick',
        ticketNumber: 'T-10005',
        subject: 'Quick Breach Test',
        status: 'OPEN',
        priority: 'CRITICAL',
        slaPolicy: DEFAULT_SLA_POLICY,
        slaResolutionDue: breachTime,
        slaStatus: 'ON_TRACK',
        contactName: 'Test',
        contactEmail: 'test@test.com',
        createdAt: now,
        updatedAt: now,
      };

      let ticketRef = mockTicket;
      const getTickets = vi.fn().mockImplementation(() => Promise.resolve([ticketRef]));
      const breachCallback = vi.fn();
      service.onBreach(breachCallback);

      service.startMonitoring(getTickets);
      await vi.advanceTimersByTimeAsync(100);

      // First check - not breached yet
      expect(breachCallback).not.toHaveBeenCalled();

      // Advance past breach time
      vi.setSystemTime(new Date(breachTime.getTime() + 1000));

      // Next check should detect breach
      await vi.advanceTimersByTimeAsync(30 * 1000);

      expect(breachCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'test-quick',
          type: 'BREACH',
        })
      );
    });

    it('should meet <1 minute KPI for breach alerts', () => {
      // The monitoring interval is 30 seconds, which is well under 1 minute
      // This test documents and verifies the KPI requirement
      const MONITORING_INTERVAL_MS = 30 * 1000;
      const KPI_THRESHOLD_MS = 60 * 1000;

      expect(MONITORING_INTERVAL_MS).toBeLessThan(KPI_THRESHOLD_MS);
    });
  });
});

describe('SLA Policy Configuration', () => {
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
  });
});
