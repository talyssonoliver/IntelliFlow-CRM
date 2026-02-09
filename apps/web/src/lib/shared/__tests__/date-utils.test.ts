import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeAgo, formatTimeRemaining, formatSlaClock } from '../date-utils';

describe('date-utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix "now" to a known timestamp
    vi.setSystemTime(new Date('2026-02-07T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatTimeAgo', () => {
    it('returns "just now" for less than 1 minute ago', () => {
      const date = new Date('2026-02-07T14:59:30.000Z'); // 30s ago
      expect(formatTimeAgo(date)).toBe('just now');
    });

    it('returns "1 minute ago" for 1-2 minutes', () => {
      const date = new Date('2026-02-07T14:58:30.000Z'); // ~90s ago
      expect(formatTimeAgo(date)).toBe('1 minute ago');
    });

    it('returns "X minutes ago" for under 1 hour', () => {
      const date = new Date('2026-02-07T14:45:00.000Z'); // 15 min ago
      expect(formatTimeAgo(date)).toBe('15 minutes ago');
    });

    it('returns "1 hour ago" for 1-2 hours', () => {
      const date = new Date('2026-02-07T13:30:00.000Z'); // 1.5h ago
      expect(formatTimeAgo(date)).toBe('1 hour ago');
    });

    it('returns "X hours ago" for under 1 day', () => {
      const date = new Date('2026-02-07T10:00:00.000Z'); // 5h ago
      expect(formatTimeAgo(date)).toBe('5 hours ago');
    });

    it('returns "1 day ago" for 1-2 days', () => {
      const date = new Date('2026-02-06T10:00:00.000Z'); // ~29h ago
      expect(formatTimeAgo(date)).toBe('1 day ago');
    });

    it('returns "just now" for future dates', () => {
      const date = new Date('2026-02-07T16:00:00.000Z'); // 1h in future
      expect(formatTimeAgo(date)).toBe('just now');
    });

    it('accepts string dates', () => {
      expect(formatTimeAgo('2026-02-07T14:59:30.000Z')).toBe('just now');
    });
  });

  describe('formatTimeRemaining', () => {
    it('returns hours and minutes for future deadline', () => {
      const deadline = new Date('2026-02-07T17:30:00.000Z'); // 2h 30m from now
      expect(formatTimeRemaining(deadline)).toBe('2h 30m');
    });

    it('returns only minutes when under 1 hour', () => {
      const deadline = new Date('2026-02-07T15:45:00.000Z'); // 45m from now
      expect(formatTimeRemaining(deadline)).toBe('45m');
    });

    it('returns "Expired" for past deadline', () => {
      const deadline = new Date('2026-02-07T14:00:00.000Z'); // 1h ago
      expect(formatTimeRemaining(deadline)).toBe('Expired');
    });

    it('accepts string dates', () => {
      expect(formatTimeRemaining('2026-02-07T14:00:00.000Z')).toBe('Expired');
    });
  });

  describe('formatSlaClock', () => {
    it('returns positive display for future deadline', () => {
      const deadline = new Date('2026-02-07T20:30:00.000Z'); // 5h 30m from now
      const result = formatSlaClock(deadline);
      expect(result.isBreached).toBe(false);
      expect(result.display).toBe('05:30:00');
    });

    it('returns negative display with isBreached for past deadline', () => {
      const deadline = new Date('2026-02-07T14:14:48.000Z'); // ~45m 12s ago
      const result = formatSlaClock(deadline);
      expect(result.isBreached).toBe(true);
      expect(result.display).toBe('-00:45:12');
    });

    it('returns isBreached true for exactly now', () => {
      const deadline = new Date('2026-02-07T15:00:00.000Z');
      const result = formatSlaClock(deadline);
      expect(result.isBreached).toBe(true);
      expect(result.display).toBe('-00:00:00');
    });

    it('pads single digits with leading zeros', () => {
      const deadline = new Date('2026-02-07T15:05:03.000Z'); // 5m 3s from now
      const result = formatSlaClock(deadline);
      expect(result.display).toBe('00:05:03');
    });
  });
});
