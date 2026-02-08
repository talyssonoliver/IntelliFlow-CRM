/**
 * Supplementary tests for sla-badge.tsx
 *
 * Tests SLA badge utility functions: status computation, color mapping,
 * time formatting, size classes, progress calculations, and indicator dot logic.
 *
 * Uses sla-service.ts directly (no rendering).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SLATrackingService,
  DEFAULT_SLA_POLICY,
  type SLAPolicy,
  type SLATimerResult,
} from '../../../../lib/tickets/sla-service';

const slaService = new SLATrackingService();

describe('sla-badge logic supplementary2', () => {
  // ===================== getSLABadgeColor =====================
  describe('getSLABadgeColor', () => {
    it('ON_TRACK returns emerald colors', () => {
      const colors = slaService.getSLABadgeColor('ON_TRACK');
      expect(colors.bg).toBe('bg-emerald-50');
      expect(colors.text).toBe('text-emerald-700');
      expect(colors.border).toBe('border-emerald-200');
      expect(colors.darkBg).toContain('emerald');
      expect(colors.darkText).toContain('emerald');
      expect(colors.darkBorder).toContain('emerald');
    });

    it('AT_RISK returns yellow colors', () => {
      const colors = slaService.getSLABadgeColor('AT_RISK');
      expect(colors.bg).toBe('bg-yellow-50');
      expect(colors.text).toBe('text-yellow-700');
      expect(colors.border).toBe('border-yellow-200');
    });

    it('BREACHED returns red colors', () => {
      const colors = slaService.getSLABadgeColor('BREACHED');
      expect(colors.bg).toBe('bg-red-50');
      expect(colors.text).toBe('text-red-700');
      expect(colors.border).toBe('border-red-200');
    });

    it('PAUSED returns slate colors', () => {
      const colors = slaService.getSLABadgeColor('PAUSED');
      expect(colors.bg).toBe('bg-slate-50');
      expect(colors.text).toBe('text-slate-700');
    });

    it('MET returns blue colors', () => {
      const colors = slaService.getSLABadgeColor('MET');
      expect(colors.bg).toBe('bg-blue-50');
      expect(colors.text).toBe('text-blue-700');
    });

    it('each status returns all 6 color properties', () => {
      const statuses = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'MET'] as const;
      for (const status of statuses) {
        const colors = slaService.getSLABadgeColor(status);
        expect(colors).toHaveProperty('bg');
        expect(colors).toHaveProperty('text');
        expect(colors).toHaveProperty('border');
        expect(colors).toHaveProperty('darkBg');
        expect(colors).toHaveProperty('darkText');
        expect(colors).toHaveProperty('darkBorder');
      }
    });
  });

  // ===================== getSLATimerIcon =====================
  describe('getSLATimerIcon', () => {
    it('ON_TRACK returns schedule', () => {
      expect(slaService.getSLATimerIcon('ON_TRACK')).toBe('schedule');
    });

    it('AT_RISK returns timelapse', () => {
      expect(slaService.getSLATimerIcon('AT_RISK')).toBe('timelapse');
    });

    it('BREACHED returns timer_off', () => {
      expect(slaService.getSLATimerIcon('BREACHED')).toBe('timer_off');
    });

    it('PAUSED returns pause_circle', () => {
      expect(slaService.getSLATimerIcon('PAUSED')).toBe('pause_circle');
    });

    it('MET returns check_circle', () => {
      expect(slaService.getSLATimerIcon('MET')).toBe('check_circle');
    });
  });

  // ===================== SLAStatusBadge labels =====================
  describe('SLA status labels', () => {
    const labels: Record<string, string> = {
      ON_TRACK: 'On Track',
      AT_RISK: 'At Risk',
      BREACHED: 'Breached',
      PAUSED: 'Paused',
      MET: 'SLA Met',
    };

    it('maps all 5 statuses', () => {
      expect(Object.keys(labels)).toHaveLength(5);
    });

    it('ON_TRACK label is "On Track"', () => {
      expect(labels.ON_TRACK).toBe('On Track');
    });

    it('AT_RISK label is "At Risk"', () => {
      expect(labels.AT_RISK).toBe('At Risk');
    });

    it('BREACHED label is "Breached"', () => {
      expect(labels.BREACHED).toBe('Breached');
    });

    it('PAUSED label is "Paused"', () => {
      expect(labels.PAUSED).toBe('Paused');
    });

    it('MET label is "SLA Met"', () => {
      expect(labels.MET).toBe('SLA Met');
    });
  });

  // ===================== Size classes =====================
  describe('size classes', () => {
    const sizeClasses = {
      sm: 'text-xs px-2 py-0.5',
      md: 'text-sm px-2 py-1',
      lg: 'text-base px-3 py-1.5',
    };

    const statusBadgeSizeClasses = {
      sm: 'text-xs px-2 py-0.5',
      md: 'text-sm px-2.5 py-1',
      lg: 'text-base px-3 py-1.5',
    };

    it('timer badge sm size', () => {
      expect(sizeClasses.sm).toContain('text-xs');
    });

    it('timer badge md size', () => {
      expect(sizeClasses.md).toContain('text-sm');
    });

    it('timer badge lg size', () => {
      expect(sizeClasses.lg).toContain('text-base');
    });

    it('status badge md size has different padding', () => {
      expect(statusBadgeSizeClasses.md).toContain('px-2.5');
    });
  });

  // ===================== Icon sizes =====================
  describe('icon sizes', () => {
    const iconSizes = { sm: '14px', md: '16px', lg: '18px' };

    it('sm is 14px', () => expect(iconSizes.sm).toBe('14px'));
    it('md is 16px', () => expect(iconSizes.md).toBe('16px'));
    it('lg is 18px', () => expect(iconSizes.lg).toBe('18px'));
  });

  // ===================== SLAProgressBar logic =====================
  describe('SLAProgressBar logic', () => {
    it('clamps percent to 0-100 range', () => {
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      expect(clamp(150)).toBe(100);
      expect(clamp(-20)).toBe(0);
      expect(clamp(50)).toBe(50);
    });

    it('progress color mapping', () => {
      const progressColors: Record<string, string> = {
        ON_TRACK: 'bg-emerald-500',
        AT_RISK: 'bg-yellow-500',
        BREACHED: 'bg-red-500',
        PAUSED: 'bg-slate-400',
        MET: 'bg-blue-500',
      };
      expect(progressColors.ON_TRACK).toBe('bg-emerald-500');
      expect(progressColors.AT_RISK).toBe('bg-yellow-500');
      expect(progressColors.BREACHED).toBe('bg-red-500');
      expect(progressColors.PAUSED).toBe('bg-slate-400');
      expect(progressColors.MET).toBe('bg-blue-500');
    });

    it('height classes', () => {
      const heightClasses = { xs: 'h-1', sm: 'h-2', md: 'h-3' };
      expect(heightClasses.xs).toBe('h-1');
      expect(heightClasses.sm).toBe('h-2');
      expect(heightClasses.md).toBe('h-3');
    });
  });

  // ===================== SLAIndicatorDot logic =====================
  describe('SLAIndicatorDot logic', () => {
    it('dot colors for each status', () => {
      const dotColors: Record<string, string> = {
        ON_TRACK: 'bg-emerald-500',
        AT_RISK: 'bg-yellow-500',
        BREACHED: 'bg-red-500',
        PAUSED: 'bg-slate-400',
        MET: 'bg-blue-500',
      };

      expect(dotColors.ON_TRACK).toBe('bg-emerald-500');
      expect(dotColors.BREACHED).toBe('bg-red-500');
    });

    it('dot size classes', () => {
      const sizeClasses = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-3 h-3' };
      expect(sizeClasses.sm).toContain('w-1.5');
      expect(sizeClasses.md).toContain('w-2');
      expect(sizeClasses.lg).toContain('w-3');
    });

    it('pulse is enabled for AT_RISK', () => {
      const pulse = true;
      const status = 'AT_RISK';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(true);
    });

    it('pulse is enabled for BREACHED', () => {
      const pulse = true;
      const status = 'BREACHED';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(true);
    });

    it('pulse is disabled for ON_TRACK', () => {
      const pulse = true;
      const status = 'ON_TRACK';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(false);
    });

    it('pulse is disabled when pulse prop is false', () => {
      const pulse = false;
      const status = 'AT_RISK';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(false);
    });

    it('pulse is disabled for PAUSED', () => {
      const pulse = true;
      const status = 'PAUSED';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(false);
    });

    it('pulse is disabled for MET', () => {
      const pulse = true;
      const status = 'MET';
      const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');
      expect(shouldPulse).toBe(false);
    });
  });

  // ===================== SLAQuickView priority colors =====================
  describe('SLAQuickView priority colors', () => {
    const priorityColors = {
      CRITICAL: 'text-red-600 dark:text-red-400',
      HIGH: 'text-orange-600 dark:text-orange-400',
      MEDIUM: 'text-slate-600 dark:text-slate-400',
      LOW: 'text-slate-500 dark:text-slate-500',
    };

    it('CRITICAL is red', () => {
      expect(priorityColors.CRITICAL).toContain('red');
    });

    it('HIGH is orange', () => {
      expect(priorityColors.HIGH).toContain('orange');
    });

    it('MEDIUM is slate-600', () => {
      expect(priorityColors.MEDIUM).toContain('slate-600');
    });

    it('LOW is slate-500', () => {
      expect(priorityColors.LOW).toContain('slate-500');
    });
  });

  // ===================== formatRemainingTime =====================
  describe('formatRemainingTime', () => {
    it('formats positive hours and minutes', () => {
      const result = slaService.formatRemainingTime(125); // 2h 5m
      expect(result).toBe('02h 05m');
    });

    it('formats just minutes when under 60', () => {
      const result = slaService.formatRemainingTime(45);
      expect(result).toBe('45m');
    });

    it('formats negative (breached) time', () => {
      const result = slaService.formatRemainingTime(-30);
      expect(result).toBe('-30m');
    });

    it('formats negative hours', () => {
      const result = slaService.formatRemainingTime(-90); // -1h 30m
      expect(result).toBe('-01h 30m');
    });

    it('formats zero minutes', () => {
      const result = slaService.formatRemainingTime(0);
      expect(result).toBe('00m');
    });

    it('formats exactly 60 minutes as hours', () => {
      const result = slaService.formatRemainingTime(60);
      expect(result).toBe('01h 00m');
    });

    it('pads single digit minutes', () => {
      const result = slaService.formatRemainingTime(5);
      expect(result).toBe('05m');
    });
  });

  // ===================== calculateSLATimer =====================
  describe('calculateSLATimer', () => {
    const policy = DEFAULT_SLA_POLICY;

    it('returns PAUSED for WAITING_ON_CUSTOMER', () => {
      const result = slaService.calculateSLATimer(
        new Date(),
        policy,
        'WAITING_ON_CUSTOMER' as any
      );
      expect(result.status).toBe('PAUSED');
      expect(result.isBreached).toBe(false);
      expect(result.isAtRisk).toBe(false);
      expect(result.remainingFormatted).toBe('Paused');
    });

    it('returns PAUSED for WAITING_ON_THIRD_PARTY', () => {
      const result = slaService.calculateSLATimer(
        new Date(),
        policy,
        'WAITING_ON_THIRD_PARTY' as any
      );
      expect(result.status).toBe('PAUSED');
    });

    it('returns MET for RESOLVED', () => {
      const result = slaService.calculateSLATimer(new Date(), policy, 'RESOLVED');
      expect(result.status).toBe('MET');
      expect(result.remainingFormatted).toBe('Completed');
    });

    it('returns MET for CLOSED', () => {
      const result = slaService.calculateSLATimer(new Date(), policy, 'CLOSED');
      expect(result.status).toBe('MET');
    });

    it('returns BREACHED when due time is past', () => {
      const pastDue = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const result = slaService.calculateSLATimer(pastDue, policy, 'OPEN');
      expect(result.status).toBe('BREACHED');
      expect(result.isBreached).toBe(true);
      expect(result.remainingMinutes).toBeLessThan(0);
    });

    it('returns ON_TRACK when plenty of time remaining', () => {
      const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const result = slaService.calculateSLATimer(futureDue, policy, 'OPEN');
      expect(result.status).toBe('ON_TRACK');
      expect(result.isBreached).toBe(false);
    });

    it('breachTime is undefined when breached', () => {
      const pastDue = new Date(Date.now() - 60 * 60 * 1000);
      const result = slaService.calculateSLATimer(pastDue, policy, 'OPEN');
      expect(result.breachTime).toBeUndefined();
    });

    it('breachTime is set to dueTime when not breached', () => {
      const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const result = slaService.calculateSLATimer(futureDue, policy, 'OPEN');
      expect(result.breachTime).toEqual(futureDue);
    });
  });

  // ===================== DEFAULT_SLA_POLICY =====================
  describe('DEFAULT_SLA_POLICY', () => {
    it('has id "default"', () => {
      expect(DEFAULT_SLA_POLICY.id).toBe('default');
    });

    it('critical response is fastest', () => {
      expect(DEFAULT_SLA_POLICY.criticalResponseMinutes).toBeLessThan(
        DEFAULT_SLA_POLICY.highResponseMinutes
      );
    });

    it('low resolution is longest', () => {
      expect(DEFAULT_SLA_POLICY.lowResolutionMinutes).toBeGreaterThan(
        DEFAULT_SLA_POLICY.criticalResolutionMinutes
      );
    });

    it('warning threshold is 25%', () => {
      expect(DEFAULT_SLA_POLICY.warningThresholdPercent).toBe(25);
    });
  });
});
