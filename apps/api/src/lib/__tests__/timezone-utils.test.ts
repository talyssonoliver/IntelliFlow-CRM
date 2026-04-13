import { describe, it, expect } from 'vitest';
import {
  formatISODateInTimezone,
  startOfDayInTimezone,
  endOfDayInTimezone,
  startOfMonthInTimezone,
  getHourInTimezone,
  formatDateTimeInTimezone,
} from '../timezone-utils';

// Fixed UTC timestamp: March 15, 2026 at 14:30:00 UTC
const FIXED_UTC = new Date('2026-03-15T14:30:00.000Z');

// March 16 03:00 UTC = still March 15 in New York (EDT)
const CROSS_DAY_UTC = new Date('2026-03-16T03:00:00.000Z');

describe('API timezone-utils', () => {
  describe('formatISODateInTimezone', () => {
    it('returns ISO date in UTC', () => {
      expect(formatISODateInTimezone(FIXED_UTC, 'UTC')).toBe('2026-03-15');
    });

    it('handles cross-day boundary for negative offset', () => {
      expect(formatISODateInTimezone(CROSS_DAY_UTC, 'America/New_York')).toBe('2026-03-15');
      expect(formatISODateInTimezone(CROSS_DAY_UTC, 'UTC')).toBe('2026-03-16');
    });

    it('handles positive offset timezone', () => {
      // 16:00 UTC March 15 = 01:00 March 16 in Tokyo (UTC+9)
      const lateUtc = new Date('2026-03-15T16:00:00.000Z');
      expect(formatISODateInTimezone(lateUtc, 'Asia/Tokyo')).toBe('2026-03-16');
    });
  });

  describe('startOfDayInTimezone', () => {
    it('returns midnight UTC for UTC timezone', () => {
      const result = startOfDayInTimezone('UTC', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('returns midnight New York as UTC', () => {
      // March 15 2026 is in EDT (UTC-4), DST started March 8
      const result = startOfDayInTimezone('America/New_York', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    });

    it('handles cross-day reference', () => {
      // March 16 03:00 UTC = March 15 in New York → start of March 15 EDT
      const result = startOfDayInTimezone('America/New_York', CROSS_DAY_UTC);
      expect(result.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    });

    it('handles positive offset', () => {
      // Tokyo UTC+9: midnight Tokyo March 15 = March 14 15:00 UTC
      const result = startOfDayInTimezone('Asia/Tokyo', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-14T15:00:00.000Z');
    });

    it('replaces the server-local-time anti-pattern', () => {
      // OLD (broken): new Date(now.getFullYear(), now.getMonth(), now.getDate())
      // This uses server local time. If server is UTC but user is in New York,
      // "today" boundary is wrong.
      //
      // NEW (correct): startOfDayInTimezone('America/New_York', now)
      // Always produces the right UTC boundary for the user's timezone.
      const userTz = 'America/New_York';
      const now = FIXED_UTC;

      const correctStart = startOfDayInTimezone(userTz, now);

      // The result should be 04:00 UTC (midnight EDT)
      expect(correctStart.getUTCHours()).toBe(4);
      expect(correctStart.getUTCMinutes()).toBe(0);
      expect(correctStart.getUTCSeconds()).toBe(0);
    });
  });

  describe('endOfDayInTimezone', () => {
    it('is 24 hours after startOfDay', () => {
      const start = startOfDayInTimezone('America/New_York', FIXED_UTC);
      const end = endOfDayInTimezone('America/New_York', FIXED_UTC);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('startOfMonthInTimezone', () => {
    it('returns first of month in UTC', () => {
      const result = startOfMonthInTimezone('UTC', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('respects timezone for month boundary', () => {
      // March 1 in New York: before DST (March 8), so EST (UTC-5)
      const marchMid = new Date('2026-03-01T12:00:00.000Z');
      const result = startOfMonthInTimezone('America/New_York', marchMid);
      expect(result.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    });
  });

  describe('getHourInTimezone', () => {
    it('returns UTC hour', () => {
      expect(getHourInTimezone('UTC', FIXED_UTC)).toBe(14);
    });

    it('returns timezone-adjusted hour', () => {
      // 14:30 UTC = 10:30 EDT
      expect(getHourInTimezone('America/New_York', FIXED_UTC)).toBe(10);
    });

    it('handles evening hours across day boundary', () => {
      // 03:00 UTC = 23:00 EDT previous day
      expect(getHourInTimezone('America/New_York', CROSS_DAY_UTC)).toBe(23);
    });
  });

  describe('formatDateTimeInTimezone', () => {
    it('formats with timezone applied', () => {
      const result = formatDateTimeInTimezone(FIXED_UTC, 'UTC');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
      // en-GB locale uses 24h format (14:30, not 2:30 PM)
      expect(result).toContain('14:30');
    });

    it('adjusts display for user timezone', () => {
      const result = formatDateTimeInTimezone(FIXED_UTC, 'America/New_York');
      // 14:30 UTC = 10:30 EDT in 24h format
      expect(result).toContain('10:30');
    });

    it('shows correct day when crossing boundary', () => {
      // 03:00 UTC March 16 = 23:00 March 15 in New York (24h format)
      const result = formatDateTimeInTimezone(CROSS_DAY_UTC, 'America/New_York');
      expect(result).toContain('15');
      expect(result).toContain('23:00');
    });
  });
});
