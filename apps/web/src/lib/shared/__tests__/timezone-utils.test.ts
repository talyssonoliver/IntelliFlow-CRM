import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatDateShort,
  formatISODate,
  formatTimeRange,
  startOfDay,
  endOfDay,
  startOfMonth,
  getHourInTimezone,
  parseDateInputValue,
  getTimezoneAbbreviation,
  getTimezoneLabel,
  getAvailableTimezones,
} from '../timezone-utils';

// Fixed UTC timestamp: March 15, 2026 at 14:30:00 UTC
const FIXED_UTC = new Date('2026-03-15T14:30:00.000Z');

// March 16, 2026 at 03:00 UTC = still March 15 in New York (EDT, UTC-4)
const CROSS_DAY_UTC = new Date('2026-03-16T03:00:00.000Z');

describe('timezone-utils', () => {
  describe('formatDate', () => {
    it('formats in UTC by default', () => {
      const result = formatDate(FIXED_UTC);
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });

    it('formats in a specific timezone', () => {
      // 14:30 UTC on March 15 is still March 15 in Tokyo (UTC+9 = 23:30)
      const result = formatDate(FIXED_UTC, 'Asia/Tokyo');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });

    it('handles cross-day boundary correctly', () => {
      // 03:00 UTC March 16 = March 15 in New York (EDT)
      const nyResult = formatISODate(CROSS_DAY_UTC, 'America/New_York');
      expect(nyResult).toBe('2026-03-15');

      // Same time is March 16 in UTC
      const utcResult = formatISODate(CROSS_DAY_UTC, 'UTC');
      expect(utcResult).toBe('2026-03-16');
    });

    it('accepts string input', () => {
      const result = formatDate('2026-03-15T14:30:00.000Z');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
    });

    it('accepts numeric timestamp input', () => {
      const result = formatDate(FIXED_UTC.getTime());
      expect(result).toContain('Mar');
      expect(result).toContain('15');
    });

    it('accepts weekday option', () => {
      const result = formatDate(FIXED_UTC, 'UTC', { weekday: 'long' });
      expect(result).toContain('Sunday');
    });
  });

  describe('formatTime', () => {
    it('formats time in UTC', () => {
      // formatTime uses en-GB (24-hour) by default, so 14:30 UTC renders as
      // '14:30' (not '2:30 PM'). Callers who need 12-hour must pass hour12.
      const result = formatTime(FIXED_UTC, 'UTC');
      expect(result).toContain('14:30');
    });

    it('formats time in a different timezone', () => {
      // 14:30 UTC = 10:30 in New York (EDT, UTC-4), 24-hour en-GB format.
      const result = formatTime(FIXED_UTC, 'America/New_York');
      expect(result).toContain('10:30');
    });

    it('supports 24-hour format', () => {
      const result = formatTime(FIXED_UTC, 'UTC', { hour12: false });
      expect(result).toContain('14:30');
    });
  });

  describe('formatDateTime', () => {
    it('formats both date and time', () => {
      // en-GB locale: '15 Mar 2026, 14:30' (24-hour).
      const result = formatDateTime(FIXED_UTC, 'UTC');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
      expect(result).toContain('14:30');
    });

    it('respects timezone for both date and time parts', () => {
      // 03:00 UTC March 16 → March 15 23:00 in New York (EDT, 24-hour).
      const result = formatDateTime(CROSS_DAY_UTC, 'America/New_York');
      expect(result).toContain('15');
      expect(result).toContain('23:00');
    });
  });

  describe('formatDateShort', () => {
    it('formats as numeric date (en-GB day/month/year)', () => {
      const result = formatDateShort(FIXED_UTC, 'UTC');
      expect(result).toBe('15/03/2026');
    });
  });

  describe('formatISODate', () => {
    it('returns YYYY-MM-DD in UTC', () => {
      expect(formatISODate(FIXED_UTC, 'UTC')).toBe('2026-03-15');
    });

    it('adjusts for timezone when crossing day boundary', () => {
      expect(formatISODate(CROSS_DAY_UTC, 'America/New_York')).toBe('2026-03-15');
      expect(formatISODate(CROSS_DAY_UTC, 'UTC')).toBe('2026-03-16');
    });

    it('handles positive offset timezone', () => {
      // 14:30 UTC March 15 = 23:30 March 15 in Tokyo (UTC+9)
      expect(formatISODate(FIXED_UTC, 'Asia/Tokyo')).toBe('2026-03-15');

      // But 16:00 UTC March 15 = 01:00 March 16 in Tokyo
      const lateUtc = new Date('2026-03-15T16:00:00.000Z');
      expect(formatISODate(lateUtc, 'Asia/Tokyo')).toBe('2026-03-16');
    });
  });

  describe('startOfDay', () => {
    it('returns midnight UTC for UTC timezone', () => {
      const result = startOfDay('UTC', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('returns midnight New York time as UTC', () => {
      // March 15 in New York: EDT (UTC-4) since DST started March 8, 2026
      // Midnight EDT = 04:00 UTC
      const result = startOfDay('America/New_York', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    });

    it('handles cross-day reference correctly', () => {
      // CROSS_DAY_UTC is March 16 03:00 UTC = March 15 in New York
      const result = startOfDay('America/New_York', CROSS_DAY_UTC);
      expect(result.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    });

    it('handles positive offset timezone', () => {
      // Tokyo is UTC+9, so midnight Tokyo = 15:00 UTC previous day
      const result = startOfDay('Asia/Tokyo', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-14T15:00:00.000Z');
    });
  });

  describe('endOfDay', () => {
    it('is exactly 24 hours after startOfDay', () => {
      const start = startOfDay('America/New_York', FIXED_UTC);
      const end = endOfDay('America/New_York', FIXED_UTC);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('startOfMonth', () => {
    it('returns first day of month in timezone', () => {
      // March 15 in UTC → start of March in UTC
      const result = startOfMonth('UTC', FIXED_UTC);
      expect(result.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('respects timezone for month boundary', () => {
      // March 1 midnight in New York (EDT) = March 1 04:00 UTC
      const marchFirst = new Date('2026-03-01T12:00:00.000Z');
      const result = startOfMonth('America/New_York', marchFirst);
      // March 1 2026: EDT not yet active (DST starts March 8), so EST (UTC-5)
      expect(result.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    });
  });

  describe('getHourInTimezone', () => {
    it('returns UTC hour for UTC timezone', () => {
      expect(getHourInTimezone('UTC', FIXED_UTC)).toBe(14);
    });

    it('returns timezone-adjusted hour', () => {
      // 14:30 UTC = 10:30 EDT (UTC-4)
      expect(getHourInTimezone('America/New_York', FIXED_UTC)).toBe(10);
    });

    it('handles cross-midnight correctly', () => {
      // 03:00 UTC = 23:00 previous day in New York (EDT)
      expect(getHourInTimezone('America/New_York', CROSS_DAY_UTC)).toBe(23);
    });
  });

  describe('formatTimeRange', () => {
    it('formats start and end times', () => {
      // en-GB 24-hour format: '14:00 - 15:30'.
      const start = new Date('2026-03-15T14:00:00.000Z');
      const end = new Date('2026-03-15T15:30:00.000Z');
      const result = formatTimeRange(start, end, 'UTC');
      expect(result).toContain('14:00');
      expect(result).toContain('15:30');
      expect(result).toContain(' - ');
    });
  });

  describe('parseDateInputValue', () => {
    it('parses HTML date input at noon UTC to avoid off-by-one', () => {
      const result = parseDateInputValue('2026-03-15');
      expect(result.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    });

    it('avoids the midnight UTC bug', () => {
      // This is the bug: new Date("2026-03-15") = midnight UTC
      // which shows as March 14 in America/New_York
      const buggy = new Date('2026-03-15');
      const buggyNY = formatISODate(buggy, 'America/New_York');
      expect(buggyNY).toBe('2026-03-14'); // Bug: shows wrong day

      // parseDateInputValue avoids this
      const fixed = parseDateInputValue('2026-03-15');
      const fixedNY = formatISODate(fixed, 'America/New_York');
      expect(fixedNY).toBe('2026-03-15'); // Correct
    });
  });

  describe('getTimezoneAbbreviation', () => {
    it('returns UTC for UTC', () => {
      expect(getTimezoneAbbreviation('UTC')).toBe('UTC');
    });

    it('returns an abbreviation for named timezones', () => {
      // The underlying Intl.DateTimeFormat in Node's V8 ICU build now returns
      // 'GMT-4' style offsets for en-GB instead of 'EDT'. getTimezoneAbbreviation
      // passes that through, so we assert on the offset shape rather than the
      // DST abbreviation. March 15 2026 is after the March 8 DST switch, so
      // New York is UTC-4 (summer time).
      const abbr = getTimezoneAbbreviation('America/New_York', FIXED_UTC);
      expect(abbr).toMatch(/^(EDT|GMT-4)$/);
    });
  });

  describe('getTimezoneLabel', () => {
    it('returns a human-readable label', () => {
      const label = getTimezoneLabel('America/New_York');
      expect(label).toContain('Eastern');
    });

    it('handles unknown timezone gracefully', () => {
      const label = getTimezoneLabel('Invalid/Timezone');
      expect(label).toBe('Invalid/Timezone');
    });
  });

  describe('getAvailableTimezones (PG-189 AC-007)', () => {
    it('returns a non-empty list', () => {
      const list = getAvailableTimezones();
      expect(list.length).toBeGreaterThan(0);
    });

    it('includes UTC', () => {
      expect(getAvailableTimezones()).toContain('UTC');
    });

    it('includes at least one America/ and one Europe/ zone', () => {
      const list = getAvailableTimezones();
      expect(list.some((tz) => tz.startsWith('America/'))).toBe(true);
      expect(list.some((tz) => tz.startsWith('Europe/'))).toBe(true);
    });
  });
});
