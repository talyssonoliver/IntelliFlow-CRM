import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStatusConfig,
  getPriorityConfig,
  getTaskStatusConfig,
  formatDeadline,
  formatDeadlineShort,
  isOverdue,
  getInitials,
  timeAgo,
} from '../case-utils';

describe('case-utils', () => {
  // ── getStatusConfig ──────────────────────────────────────────────────────
  describe('getStatusConfig', () => {
    it('returns OPEN config', () => {
      const cfg = getStatusConfig('OPEN');
      expect(cfg.label).toBe('Open');
      expect(cfg.color).toContain('slate');
    });

    it('returns IN_PROGRESS config', () => {
      const cfg = getStatusConfig('IN_PROGRESS');
      expect(cfg.label).toBe('In Progress');
      expect(cfg.color).toContain('blue');
    });

    it('returns ON_HOLD config', () => {
      const cfg = getStatusConfig('ON_HOLD');
      expect(cfg.label).toBe('On Hold');
      expect(cfg.color).toContain('amber');
    });

    it('returns CLOSED config', () => {
      const cfg = getStatusConfig('CLOSED');
      expect(cfg.label).toBe('Closed');
      expect(cfg.color).toContain('green');
    });

    it('returns CANCELLED config', () => {
      const cfg = getStatusConfig('CANCELLED');
      expect(cfg.label).toBe('Cancelled');
      expect(cfg.color).toContain('red');
    });

    it('returns default config for unknown status', () => {
      const cfg = getStatusConfig('UNKNOWN_STATUS');
      expect(cfg.label).toBe('UNKNOWN_STATUS');
      expect(cfg.color).toContain('gray');
    });
  });

  // ── getPriorityConfig ────────────────────────────────────────────────────
  describe('getPriorityConfig', () => {
    it('returns URGENT config', () => {
      const cfg = getPriorityConfig('URGENT');
      expect(cfg.label).toBe('Urgent');
      expect(cfg.dotColor).toContain('red');
    });

    it('returns HIGH config', () => {
      const cfg = getPriorityConfig('HIGH');
      expect(cfg.label).toBe('High');
      expect(cfg.dotColor).toContain('red');
    });

    it('returns MEDIUM config', () => {
      const cfg = getPriorityConfig('MEDIUM');
      expect(cfg.label).toBe('Medium');
      expect(cfg.dotColor).toContain('amber');
    });

    it('returns LOW config', () => {
      const cfg = getPriorityConfig('LOW');
      expect(cfg.label).toBe('Low');
      expect(cfg.dotColor).toContain('blue');
    });

    it('returns default config for unknown priority', () => {
      const cfg = getPriorityConfig('CUSTOM');
      expect(cfg.label).toBe('CUSTOM');
      expect(cfg.dotColor).toContain('gray');
    });
  });

  // ── getTaskStatusConfig ──────────────────────────────────────────────────
  describe('getTaskStatusConfig', () => {
    it('returns PENDING config', () => {
      const cfg = getTaskStatusConfig('PENDING');
      expect(cfg.label).toBe('Pending');
      expect(cfg.color).toContain('gray');
    });

    it('returns IN_PROGRESS config', () => {
      const cfg = getTaskStatusConfig('IN_PROGRESS');
      expect(cfg.label).toBe('In Progress');
      expect(cfg.color).toContain('blue');
    });

    it('returns COMPLETED config', () => {
      const cfg = getTaskStatusConfig('COMPLETED');
      expect(cfg.label).toBe('Completed');
      expect(cfg.color).toContain('green');
    });

    it('returns CANCELLED config', () => {
      const cfg = getTaskStatusConfig('CANCELLED');
      expect(cfg.label).toBe('Cancelled');
      expect(cfg.color).toContain('red');
    });

    it('returns default config for unknown status', () => {
      const cfg = getTaskStatusConfig('BLOCKED');
      expect(cfg.label).toBe('BLOCKED');
      expect(cfg.color).toContain('gray');
    });
  });

  // ── formatDeadline ───────────────────────────────────────────────────────
  describe('formatDeadline', () => {
    it('returns "No deadline" for null', () => {
      expect(formatDeadline(null)).toBe('No deadline');
    });

    it('formats a Date object', () => {
      const result = formatDeadline(new Date('2026-03-15T00:00:00Z'));
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });

    it('formats a string date', () => {
      const result = formatDeadline('2026-06-01T00:00:00Z');
      expect(result).toContain('Jun');
      expect(result).toContain('2026');
    });
  });

  // ── formatDeadlineShort ──────────────────────────────────────────────────
  describe('formatDeadlineShort', () => {
    it('returns null for null input', () => {
      expect(formatDeadlineShort(null)).toBeNull();
    });

    it('returns month and day for a date', () => {
      const result = formatDeadlineShort('2026-03-15T00:00:00Z');
      expect(result).not.toBeNull();
      expect(result!.month).toBe('MAR');
      expect(result!.day).toBe('15');
    });

    it('formats a Date object', () => {
      const result = formatDeadlineShort(new Date('2026-12-25T00:00:00Z'));
      expect(result!.month).toBe('DEC');
      expect(result!.day).toBe('25');
    });
  });

  // ── isOverdue ────────────────────────────────────────────────────────────
  describe('isOverdue', () => {
    it('returns false for null deadline', () => {
      expect(isOverdue(null, 'OPEN')).toBe(false);
    });

    it('returns false for CLOSED status', () => {
      expect(isOverdue('2020-01-01', 'CLOSED')).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      expect(isOverdue('2020-01-01', 'CANCELLED')).toBe(false);
    });

    it('returns true for past deadline with OPEN status', () => {
      expect(isOverdue('2020-01-01', 'OPEN')).toBe(true);
    });

    it('returns false for future deadline with OPEN status', () => {
      expect(isOverdue('2099-01-01', 'OPEN')).toBe(false);
    });

    it('returns true for past deadline with IN_PROGRESS status', () => {
      expect(isOverdue('2020-06-15', 'IN_PROGRESS')).toBe(true);
    });
  });

  // ── getInitials ──────────────────────────────────────────────────────────
  describe('getInitials', () => {
    it('returns two initials for "John Smith"', () => {
      expect(getInitials('John Smith')).toBe('JS');
    });

    it('returns single initial for "Alice"', () => {
      expect(getInitials('Alice')).toBe('A');
    });

    it('returns max 2 initials for long names', () => {
      expect(getInitials('Mary Jane Watson Parker')).toBe('MJ');
    });

    it('handles lowercase names', () => {
      expect(getInitials('bob jones')).toBe('BJ');
    });
  });

  // ── timeAgo ──────────────────────────────────────────────────────────────
  describe('timeAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-16T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "just now" for recent timestamps', () => {
      expect(timeAgo('2026-02-16T11:59:30Z')).toBe('just now');
    });

    it('returns minutes ago', () => {
      expect(timeAgo('2026-02-16T11:45:00Z')).toBe('15 min ago');
    });

    it('returns "1 hour ago" for singular hour', () => {
      expect(timeAgo('2026-02-16T11:00:00Z')).toBe('1 hour ago');
    });

    it('returns plural hours ago', () => {
      expect(timeAgo('2026-02-16T06:00:00Z')).toBe('6 hours ago');
    });

    it('returns "Yesterday" for 1 day ago', () => {
      expect(timeAgo('2026-02-15T12:00:00Z')).toBe('Yesterday');
    });

    it('returns "X days ago" for 2-6 days', () => {
      expect(timeAgo('2026-02-13T12:00:00Z')).toBe('3 days ago');
    });

    it('returns formatted date for 7+ days', () => {
      const result = timeAgo('2026-01-01T12:00:00Z');
      expect(result).toContain('Jan');
      expect(result).toContain('2026');
    });

    it('accepts Date objects', () => {
      expect(timeAgo(new Date('2026-02-16T11:55:00Z'))).toBe('5 min ago');
    });
  });
});
