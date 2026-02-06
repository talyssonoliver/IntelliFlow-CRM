/**
 * DateRange Value Object Tests
 *
 * Tests date range creation, static constructors, properties,
 * comparison methods, and formatting.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { DateRange, InvalidDateRangeError } from '../DateRange';

describe('DateRange', () => {
  describe('create()', () => {
    it('should create a valid date range from Date objects', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const result = DateRange.create(start, end);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(DateRange);
    });

    it('should create a valid date range from string dates', () => {
      const result = DateRange.create('2024-01-01', '2024-01-31');

      expect(result.isSuccess).toBe(true);
      expect(result.value.start.getFullYear()).toBe(2024);
      expect(result.value.end.getMonth()).toBe(0); // January
    });

    it('should fail when start date is invalid', () => {
      const result = DateRange.create('invalid-date', '2024-01-31');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidDateRangeError);
      expect(result.error.message).toContain('Start date is invalid');
    });

    it('should fail when end date is invalid', () => {
      const result = DateRange.create('2024-01-01', 'not-a-date');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidDateRangeError);
      expect(result.error.message).toContain('End date is invalid');
    });

    it('should fail when start is after end', () => {
      const result = DateRange.create('2024-02-01', '2024-01-01');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidDateRangeError);
      expect(result.error.message).toContain('must be before or equal to end date');
    });

    it('should succeed when start equals end (same day)', () => {
      const date = new Date('2024-06-15');
      const result = DateRange.create(date, date);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationInMs).toBe(0);
    });

    it('should have error code INVALID_DATE_RANGE on failure', () => {
      const result = DateRange.create('bad', '2024-01-01');

      expect(result.error.code).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('lastNDays()', () => {
    it('should create a range for 1 day', () => {
      const result = DateRange.lastNDays(1);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationInDays).toBeGreaterThanOrEqual(1);
    });

    it('should create a range for 7 days', () => {
      const result = DateRange.lastNDays(7);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationInDays).toBeGreaterThanOrEqual(1);
    });

    it('should create a range for 30 days', () => {
      const result = DateRange.lastNDays(30);

      expect(result.isSuccess).toBe(true);
    });

    it('should fail for 0 days', () => {
      const result = DateRange.lastNDays(0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Days must be at least 1');
    });

    it('should fail for negative days', () => {
      const result = DateRange.lastNDays(-1);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Days must be at least 1');
    });
  });

  describe('lastNMonths()', () => {
    it('should create a range for 1 month', () => {
      const result = DateRange.lastNMonths(1);

      expect(result.isSuccess).toBe(true);
      expect(result.value.start).toBeInstanceOf(Date);
      expect(result.value.end).toBeInstanceOf(Date);
    });

    it('should create a range for 6 months', () => {
      const result = DateRange.lastNMonths(6);

      expect(result.isSuccess).toBe(true);
    });

    it('should fail for 0 months', () => {
      const result = DateRange.lastNMonths(0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Months must be at least 1');
    });

    it('should fail for negative months', () => {
      const result = DateRange.lastNMonths(-3);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('thisMonth()', () => {
    it('should succeed and return a valid range', () => {
      const result = DateRange.thisMonth();

      expect(result.isSuccess).toBe(true);
    });

    it('should start on the first of the current month', () => {
      const result = DateRange.thisMonth();
      const now = new Date();
      const start = result.value.start;

      expect(start.getFullYear()).toBe(now.getFullYear());
      expect(start.getMonth()).toBe(now.getMonth());
      expect(start.getDate()).toBe(1);
    });

    it('should end on the last day of the current month', () => {
      const result = DateRange.thisMonth();
      const now = new Date();
      const end = result.value.end;
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      expect(end.getDate()).toBe(lastDayOfMonth);
    });
  });

  describe('thisQuarter()', () => {
    it('should succeed and return a valid range', () => {
      const result = DateRange.thisQuarter();

      expect(result.isSuccess).toBe(true);
    });

    it('should start on the first day of the current quarter', () => {
      const result = DateRange.thisQuarter();
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = result.value.start;

      expect(start.getMonth()).toBe(quarter * 3);
      expect(start.getDate()).toBe(1);
    });

    it('should end on the last day of the current quarter', () => {
      const result = DateRange.thisQuarter();
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const expectedEndMonth = quarter * 3 + 2;
      const end = result.value.end;

      expect(end.getMonth()).toBe(expectedEndMonth);
    });
  });

  describe('thisYear()', () => {
    it('should succeed and return a valid range', () => {
      const result = DateRange.thisYear();

      expect(result.isSuccess).toBe(true);
    });

    it('should start on January 1st', () => {
      const result = DateRange.thisYear();
      const start = result.value.start;

      expect(start.getMonth()).toBe(0);
      expect(start.getDate()).toBe(1);
    });

    it('should end on December 31st', () => {
      const result = DateRange.thisYear();
      const end = result.value.end;

      expect(end.getMonth()).toBe(11);
      expect(end.getDate()).toBe(31);
    });
  });

  describe('properties', () => {
    it('start should return a copy of the start date', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = DateRange.create(start, end).value;

      const returned = range.start;
      returned.setFullYear(2099);

      expect(range.start.getFullYear()).toBe(2024);
    });

    it('end should return a copy of the end date', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = DateRange.create(start, end).value;

      const returned = range.end;
      returned.setFullYear(2099);

      expect(range.end.getFullYear()).toBe(2024);
    });

    it('durationInDays should calculate correctly for a 30-day range', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-31T00:00:00.000Z');
      const range = DateRange.create(start, end).value;

      expect(range.durationInDays).toBe(30);
    });

    it('durationInWeeks should calculate correctly', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-14T00:00:00.000Z');
      const range = DateRange.create(start, end).value;

      // 13 days -> ceil(13/7) = 2 weeks
      expect(range.durationInWeeks).toBe(2);
    });

    it('durationInMonths should calculate month difference', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-04-15');
      const range = DateRange.create(start, end).value;

      expect(range.durationInMonths).toBe(3);
    });

    it('durationInMs should return milliseconds', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-02T00:00:00.000Z');
      const range = DateRange.create(start, end).value;

      expect(range.durationInMs).toBe(86400000);
    });

    it('durationInDays should be 0 for same start and end', () => {
      const date = new Date('2024-06-15T12:00:00.000Z');
      const range = DateRange.create(date, date).value;

      // 0 ms -> ceil(0 / day) = 0
      expect(range.durationInDays).toBe(0);
    });
  });

  describe('contains()', () => {
    it('should return true for a date within the range', () => {
      const range = DateRange.create(
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T23:59:59.999Z')
      ).value;

      expect(range.contains(new Date('2024-01-15T12:00:00.000Z'))).toBe(true);
    });

    it('should return true for the start date', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-31T23:59:59.999Z');
      const range = DateRange.create(start, end).value;

      expect(range.contains(new Date('2024-01-01T00:00:00.000Z'))).toBe(true);
    });

    it('should return true for the end date', () => {
      const end = new Date('2024-01-31T23:59:59.999Z');
      const range = DateRange.create(new Date('2024-01-01T00:00:00.000Z'), end).value;

      expect(range.contains(new Date('2024-01-31T23:59:59.999Z'))).toBe(true);
    });

    it('should return false for a date before the range', () => {
      const range = DateRange.create(
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T23:59:59.999Z')
      ).value;

      expect(range.contains(new Date('2023-12-31T23:59:59.999Z'))).toBe(false);
    });

    it('should return false for a date after the range', () => {
      const range = DateRange.create(
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T23:59:59.999Z')
      ).value;

      expect(range.contains(new Date('2024-02-01T00:00:00.000Z'))).toBe(false);
    });
  });

  describe('overlaps()', () => {
    it('should return true for overlapping ranges', () => {
      const range1 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-15')).value;
      const range2 = DateRange.create(new Date('2024-01-10'), new Date('2024-01-20')).value;

      expect(range1.overlaps(range2)).toBe(true);
    });

    it('should return true when ranges share an endpoint', () => {
      const range1 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-15')).value;
      const range2 = DateRange.create(new Date('2024-01-15'), new Date('2024-01-31')).value;

      expect(range1.overlaps(range2)).toBe(true);
    });

    it('should return false for non-overlapping ranges', () => {
      const range1 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-10')).value;
      const range2 = DateRange.create(new Date('2024-01-20'), new Date('2024-01-31')).value;

      expect(range1.overlaps(range2)).toBe(false);
    });
  });

  describe('isBefore()', () => {
    it('should return true when range is entirely before another', () => {
      const range1 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-10')).value;
      const range2 = DateRange.create(new Date('2024-01-20'), new Date('2024-01-31')).value;

      expect(range1.isBefore(range2)).toBe(true);
    });

    it('should return false when ranges overlap', () => {
      const range1 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-15')).value;
      const range2 = DateRange.create(new Date('2024-01-10'), new Date('2024-01-31')).value;

      expect(range1.isBefore(range2)).toBe(false);
    });
  });

  describe('isAfter()', () => {
    it('should return true when range is entirely after another', () => {
      const range1 = DateRange.create(new Date('2024-02-01'), new Date('2024-02-28')).value;
      const range2 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-15')).value;

      expect(range1.isAfter(range2)).toBe(true);
    });

    it('should return false when ranges overlap', () => {
      const range1 = DateRange.create(new Date('2024-01-10'), new Date('2024-01-31')).value;
      const range2 = DateRange.create(new Date('2024-01-01'), new Date('2024-01-15')).value;

      expect(range1.isAfter(range2)).toBe(false);
    });
  });

  describe('format()', () => {
    it('should return a formatted string', () => {
      const range = DateRange.create(new Date('2024-01-01'), new Date('2024-01-31')).value;
      const formatted = range.format();

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain(' - ');
    });
  });

  describe('toISOString()', () => {
    it('should return an ISO string with start and end', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-31T00:00:00.000Z');
      const range = DateRange.create(start, end).value;

      const iso = range.toISOString();

      expect(iso).toContain(start.toISOString());
      expect(iso).toContain(end.toISOString());
      expect(iso).toContain(' - ');
    });
  });

  describe('toString()', () => {
    it('should return the same as format()', () => {
      const range = DateRange.create(new Date('2024-03-01'), new Date('2024-03-15')).value;

      expect(range.toString()).toBe(range.format());
    });
  });

  describe('toValue()', () => {
    it('should return an object with start and end dates', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = DateRange.create(start, end).value;

      const value = range.toValue();

      expect(value).toHaveProperty('start');
      expect(value).toHaveProperty('end');
      expect(value.start).toBeInstanceOf(Date);
      expect(value.end).toBeInstanceOf(Date);
    });
  });
});
