import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTypeConfig,
  getStatusConfig,
  getConflictSeverityColor,
  formatTimeRange,
  formatDuration,
  isOverdue,
  formatDateShort,
  timeAgo,
  getInitials,
  formatRecurrence,
  getReminderLabel,
  APPOINTMENT_TYPE_OPTIONS,
  APPOINTMENT_STATUS_OPTIONS,
  BUFFER_PRESETS,
  REMINDER_PRESETS,
} from '../appointment-utils';

describe('appointment-utils', () => {
  describe('getTypeConfig', () => {
    it('returns correct config for MEETING', () => {
      const config = getTypeConfig('MEETING');
      expect(config.label).toBe('Meeting');
      expect(config.icon).toBe('groups');
      expect(config.color).toContain('blue');
    });

    it('returns correct config for HEARING', () => {
      const config = getTypeConfig('HEARING');
      expect(config.label).toBe('Hearing');
      expect(config.icon).toBe('gavel');
      expect(config.color).toContain('red');
    });

    it('returns correct config for CALL', () => {
      const config = getTypeConfig('CALL');
      expect(config.label).toBe('Call');
      expect(config.icon).toBe('call');
    });

    it('returns correct config for CONSULTATION', () => {
      const config = getTypeConfig('CONSULTATION');
      expect(config.label).toBe('Consultation');
    });

    it('returns correct config for DEPOSITION', () => {
      const config = getTypeConfig('DEPOSITION');
      expect(config.label).toBe('Deposition');
    });

    it('returns correct config for OTHER', () => {
      const config = getTypeConfig('OTHER');
      expect(config.label).toBe('Other');
    });

    it('returns fallback for unknown type', () => {
      const config = getTypeConfig('UNKNOWN');
      expect(config.label).toBe('UNKNOWN');
      expect(config.icon).toBe('event');
    });
  });

  describe('getStatusConfig', () => {
    it.each([
      ['SCHEDULED', 'Scheduled'],
      ['CONFIRMED', 'Confirmed'],
      ['IN_PROGRESS', 'In Progress'],
      ['COMPLETED', 'Completed'],
      ['CANCELLED', 'Cancelled'],
      ['NO_SHOW', 'No Show'],
    ])('returns label "%s" -> "%s"', (status, label) => {
      expect(getStatusConfig(status).label).toBe(label);
    });

    it('returns fallback for unknown status', () => {
      expect(getStatusConfig('UNKNOWN').label).toBe('UNKNOWN');
    });
  });

  describe('getConflictSeverityColor', () => {
    it('returns red for EXACT', () => {
      const c = getConflictSeverityColor('EXACT');
      expect(c.color).toContain('red');
      expect(c.bgColor).toContain('red');
    });

    it('returns orange for PARTIAL', () => {
      const c = getConflictSeverityColor('PARTIAL');
      expect(c.color).toContain('orange');
    });

    it('returns yellow for BUFFER', () => {
      const c = getConflictSeverityColor('BUFFER');
      expect(c.color).toContain('yellow');
    });

    it('returns gray for unknown', () => {
      const c = getConflictSeverityColor('UNKNOWN');
      expect(c.color).toContain('gray');
    });
  });

  describe('formatTimeRange', () => {
    it('formats time range correctly', () => {
      const result = formatTimeRange(
        new Date('2026-02-14T10:00:00'),
        new Date('2026-02-14T11:30:00')
      );
      expect(result).toContain('10:00');
      expect(result).toContain('11:30');
      expect(result).toContain('-');
    });

    it('handles string inputs', () => {
      const result = formatTimeRange('2026-02-14T14:00:00', '2026-02-14T15:00:00');
      expect(result).toContain('-');
    });
  });

  describe('formatDuration', () => {
    it('formats hours only', () => {
      expect(formatDuration('2026-02-14T10:00:00', '2026-02-14T12:00:00')).toBe('2h');
    });

    it('formats minutes only', () => {
      expect(formatDuration('2026-02-14T10:00:00', '2026-02-14T10:30:00')).toBe('30m');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration('2026-02-14T10:00:00', '2026-02-14T11:30:00')).toBe('1h 30m');
    });
  });

  describe('isOverdue', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true for past end time with active status', () => {
      expect(isOverdue('2026-02-14T10:00:00Z', 'SCHEDULED')).toBe(true);
    });

    it('returns false for future end time', () => {
      expect(isOverdue('2026-02-16T10:00:00Z', 'SCHEDULED')).toBe(false);
    });

    it('returns false for COMPLETED status', () => {
      expect(isOverdue('2026-02-14T10:00:00Z', 'COMPLETED')).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(isOverdue('2026-02-14T10:00:00Z', 'CANCELLED')).toBe(false);
    });

    it('returns false for NO_SHOW status', () => {
      expect(isOverdue('2026-02-14T10:00:00Z', 'NO_SHOW')).toBe(false);
    });
  });

  describe('formatDateShort', () => {
    it('formats date correctly', () => {
      const result = formatDateShort(new Date('2026-02-14'));
      expect(result).toContain('Feb');
      expect(result).toContain('14');
    });
  });

  describe('timeAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "just now" for recent', () => {
      expect(timeAgo('2026-02-15T11:59:30Z')).toBe('just now');
    });

    it('returns minutes ago', () => {
      expect(timeAgo('2026-02-15T11:55:00Z')).toBe('5 min ago');
    });

    it('returns hours ago', () => {
      expect(timeAgo('2026-02-15T09:00:00Z')).toBe('3 hours ago');
    });

    it('returns Yesterday', () => {
      expect(timeAgo('2026-02-14T12:00:00Z')).toBe('Yesterday');
    });

    it('returns days ago', () => {
      expect(timeAgo('2026-02-12T12:00:00Z')).toBe('3 days ago');
    });
  });

  describe('getInitials', () => {
    it('returns initials from full name', () => {
      expect(getInitials('Jane Doe')).toBe('JD');
    });

    it('handles single name', () => {
      expect(getInitials('Jane')).toBe('J');
    });

    it('limits to 2 characters', () => {
      expect(getInitials('John Michael Smith')).toBe('JM');
    });
  });

  describe('formatRecurrence', () => {
    it('returns empty for null', () => {
      expect(formatRecurrence(null)).toBe('');
    });

    it('returns empty for undefined', () => {
      expect(formatRecurrence(undefined)).toBe('');
    });

    it('formats daily recurrence', () => {
      const result = formatRecurrence({ frequency: 'DAILY', interval: 1 });
      expect(result).toBe('Repeats every day');
    });

    it('formats weekly with interval', () => {
      const result = formatRecurrence({ frequency: 'WEEKLY', interval: 2 });
      expect(result).toBe('Repeats every 2 weeks');
    });

    it('formats weekly with days', () => {
      const result = formatRecurrence({
        frequency: 'WEEKLY',
        interval: 1,
        daysOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
      });
      expect(result).toContain('Mon, Wed, Fri');
    });

    it('formats monthly with day of month', () => {
      const result = formatRecurrence({
        frequency: 'MONTHLY',
        interval: 1,
        dayOfMonth: 15,
      });
      expect(result).toContain('on day 15');
    });

    it('formats with end date', () => {
      const result = formatRecurrence({
        frequency: 'DAILY',
        interval: 1,
        endDate: new Date('2026-03-15'),
      });
      expect(result).toContain('until');
      expect(result).toContain('Mar');
    });

    it('formats with occurrence count', () => {
      const result = formatRecurrence({
        frequency: 'DAILY',
        interval: 1,
        occurrenceCount: 10,
      });
      expect(result).toContain('10 occurrences');
    });
  });

  describe('getReminderLabel', () => {
    it('formats minutes', () => {
      expect(getReminderLabel(15)).toBe('15 min before');
    });

    it('formats 1 hour', () => {
      expect(getReminderLabel(60)).toBe('1 hour before');
    });

    it('formats 1 day', () => {
      expect(getReminderLabel(1440)).toBe('1 day before');
    });
  });

  describe('constants', () => {
    it('APPOINTMENT_TYPE_OPTIONS has 6 types', () => {
      expect(APPOINTMENT_TYPE_OPTIONS).toHaveLength(6);
    });

    it('APPOINTMENT_STATUS_OPTIONS has 6 statuses', () => {
      expect(APPOINTMENT_STATUS_OPTIONS).toHaveLength(6);
    });

    it('BUFFER_PRESETS starts with 0', () => {
      expect(BUFFER_PRESETS[0]).toBe(0);
    });

    it('REMINDER_PRESETS includes 60', () => {
      expect(REMINDER_PRESETS).toContain(60);
    });
  });
});
