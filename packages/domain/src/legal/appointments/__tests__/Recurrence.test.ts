/**
 * Recurrence Value Object Tests
 *
 * Tests the Recurrence value object which represents recurring
 * patterns for appointments (daily, weekly, monthly, yearly, custom).
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { Recurrence, InvalidRecurrenceError, DayOfWeek } from '../Recurrence';

describe('Recurrence Value Object', () => {
  describe('createDaily()', () => {
    it('should create a daily recurrence', () => {
      const result = Recurrence.createDaily();

      expect(result.isSuccess).toBe(true);
      expect(result.value.frequency).toBe('DAILY');
      expect(result.value.interval).toBe(1);
    });

    it('should create a daily recurrence with custom interval', () => {
      const result = Recurrence.createDaily(2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.interval).toBe(2);
    });

    it('should create daily recurrence with end date', () => {
      const endDate = new Date('2024-12-31');
      const result = Recurrence.createDaily(1, { endDate });

      expect(result.isSuccess).toBe(true);
      expect(result.value.endDate?.getTime()).toBe(endDate.getTime());
    });

    it('should create daily recurrence with occurrence count', () => {
      const result = Recurrence.createDaily(1, { occurrenceCount: 10 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.occurrenceCount).toBe(10);
    });

    it('should fail with interval less than 1', () => {
      const result = Recurrence.createDaily(0);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidRecurrenceError);
      expect(result.error.message).toContain('at least 1');
    });

    it('should fail with negative interval', () => {
      const result = Recurrence.createDaily(-1);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('createWeekly()', () => {
    it('should create a weekly recurrence', () => {
      const result = Recurrence.createWeekly(['MONDAY', 'WEDNESDAY', 'FRIDAY']);

      expect(result.isSuccess).toBe(true);
      expect(result.value.frequency).toBe('WEEKLY');
      expect(result.value.interval).toBe(1);
      expect(result.value.daysOfWeek).toEqual(['MONDAY', 'WEDNESDAY', 'FRIDAY']);
    });

    it('should create bi-weekly recurrence', () => {
      const result = Recurrence.createWeekly(['MONDAY'], 2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.interval).toBe(2);
    });

    it('should fail with empty days of week', () => {
      const result = Recurrence.createWeekly([]);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('At least one day');
    });

    it('should fail with interval less than 1', () => {
      const result = Recurrence.createWeekly(['MONDAY'], 0);

      expect(result.isFailure).toBe(true);
    });

    it('should create weekly with end date', () => {
      const endDate = new Date('2024-12-31');
      const result = Recurrence.createWeekly(['TUESDAY'], 1, { endDate });

      expect(result.isSuccess).toBe(true);
      expect(result.value.endDate?.getTime()).toBe(endDate.getTime());
    });
  });

  describe('createMonthly()', () => {
    it('should create a monthly recurrence', () => {
      const result = Recurrence.createMonthly(15);

      expect(result.isSuccess).toBe(true);
      expect(result.value.frequency).toBe('MONTHLY');
      expect(result.value.dayOfMonth).toBe(15);
    });

    it('should create bi-monthly recurrence', () => {
      const result = Recurrence.createMonthly(1, 2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.interval).toBe(2);
    });

    it('should fail with day of month less than 1', () => {
      const result = Recurrence.createMonthly(0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('between 1 and 31');
    });

    it('should fail with day of month greater than 31', () => {
      const result = Recurrence.createMonthly(32);

      expect(result.isFailure).toBe(true);
    });

    it('should accept day 31 (edge case)', () => {
      const result = Recurrence.createMonthly(31);

      expect(result.isSuccess).toBe(true);
      expect(result.value.dayOfMonth).toBe(31);
    });

    it('should fail with interval less than 1', () => {
      const result = Recurrence.createMonthly(15, 0);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('createYearly()', () => {
    it('should create a yearly recurrence', () => {
      const result = Recurrence.createYearly(12, 25); // December 25

      expect(result.isSuccess).toBe(true);
      expect(result.value.frequency).toBe('YEARLY');
      expect(result.value.monthOfYear).toBe(12);
      expect(result.value.dayOfMonth).toBe(25);
    });

    it('should create bi-yearly recurrence', () => {
      const result = Recurrence.createYearly(1, 1, 2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.interval).toBe(2);
    });

    it('should fail with month less than 1', () => {
      const result = Recurrence.createYearly(0, 15);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('between 1 and 12');
    });

    it('should fail with month greater than 12', () => {
      const result = Recurrence.createYearly(13, 15);

      expect(result.isFailure).toBe(true);
    });

    it('should fail with day less than 1', () => {
      const result = Recurrence.createYearly(6, 0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Day of month');
    });

    it('should fail with day greater than 31', () => {
      const result = Recurrence.createYearly(6, 32);

      expect(result.isFailure).toBe(true);
    });

    it('should fail with interval less than 1', () => {
      const result = Recurrence.createYearly(6, 15, 0);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('createCustom()', () => {
    it('should create a custom recurrence', () => {
      const result = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 3,
        daysOfWeek: ['MONDAY', 'THURSDAY'],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.frequency).toBe('CUSTOM');
      expect(result.value.interval).toBe(3);
    });

    it('should create custom with exception dates', () => {
      const exception = new Date('2024-07-04');
      const result = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        exceptionDates: [exception],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.exceptionDates).toHaveLength(1);
    });

    it('should fail with interval less than 1', () => {
      const result = Recurrence.createCustom({
        frequency: 'DAILY',
        interval: 0,
      });

      expect(result.isFailure).toBe(true);
    });
  });

  describe('withException()', () => {
    it('should add an exception date', () => {
      const recurrence = Recurrence.createDaily().value;
      const exception = new Date('2024-07-04');

      const updated = recurrence.withException(exception);

      expect(updated.exceptionDates).toHaveLength(1);
      expect(updated.isException(exception)).toBe(true);
    });

    it('should accumulate exception dates', () => {
      const recurrence = Recurrence.createDaily().value;
      const exception1 = new Date('2024-07-04');
      const exception2 = new Date('2024-12-25');

      const updated = recurrence.withException(exception1).withException(exception2);

      expect(updated.exceptionDates).toHaveLength(2);
    });

    it('should not modify original recurrence', () => {
      const original = Recurrence.createDaily().value;
      const exception = new Date('2024-07-04');

      original.withException(exception);

      expect(original.exceptionDates).toHaveLength(0);
    });
  });

  describe('removeException()', () => {
    it('should remove an exception date', () => {
      const exception = new Date('2024-07-04');
      const recurrence = Recurrence.createDaily().value.withException(exception);

      const updated = recurrence.removeException(exception);

      expect(updated.exceptionDates).toHaveLength(0);
      expect(updated.isException(exception)).toBe(false);
    });

    it('should not fail when removing non-existent exception', () => {
      const recurrence = Recurrence.createDaily().value;
      const nonExistent = new Date('2024-07-04');

      const updated = recurrence.removeException(nonExistent);

      expect(updated.exceptionDates).toHaveLength(0);
    });
  });

  describe('isException()', () => {
    it('should return true for exception date', () => {
      const exception = new Date('2024-07-04');
      const recurrence = Recurrence.createDaily().value.withException(exception);

      expect(recurrence.isException(exception)).toBe(true);
    });

    it('should return false for non-exception date', () => {
      const recurrence = Recurrence.createDaily().value;
      const date = new Date('2024-07-04');

      expect(recurrence.isException(date)).toBe(false);
    });

    it('should match by day only (ignoring time)', () => {
      const exception = new Date('2024-07-04T10:00:00Z');
      const recurrence = Recurrence.createDaily().value.withException(exception);

      const sameDay = new Date('2024-07-04T15:00:00Z');

      expect(recurrence.isException(sameDay)).toBe(true);
    });
  });

  describe('hasEnded()', () => {
    it('should return true when current date is past end date', () => {
      const endDate = new Date('2024-06-30');
      const recurrence = Recurrence.createDaily(1, { endDate }).value;

      const currentDate = new Date('2024-07-15');

      expect(recurrence.hasEnded(currentDate)).toBe(true);
    });

    it('should return false when current date is before end date', () => {
      const endDate = new Date('2024-12-31');
      const recurrence = Recurrence.createDaily(1, { endDate }).value;

      const currentDate = new Date('2024-06-15');

      expect(recurrence.hasEnded(currentDate)).toBe(false);
    });

    it('should return false when no end date is set', () => {
      const recurrence = Recurrence.createDaily().value;
      const currentDate = new Date('2099-12-31');

      expect(recurrence.hasEnded(currentDate)).toBe(false);
    });
  });

  describe('generateOccurrences()', () => {
    it('should generate daily occurrences', () => {
      const recurrence = Recurrence.createDaily().value;
      const startDate = new Date('2024-01-01');

      const occurrences = recurrence.generateOccurrences(startDate, 7);

      expect(occurrences).toHaveLength(7);
    });

    it('should generate weekly occurrences', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY']).value;
      const startDate = new Date('2024-01-01'); // Monday

      const occurrences = recurrence.generateOccurrences(startDate, 4);

      expect(occurrences.length).toBeGreaterThan(0);
    });

    it('should respect end date', () => {
      const endDate = new Date('2024-01-10');
      const recurrence = Recurrence.createDaily(1, { endDate }).value;
      const startDate = new Date('2024-01-01');

      const occurrences = recurrence.generateOccurrences(startDate, 100);

      expect(occurrences.length).toBeLessThanOrEqual(10);
    });

    it('should respect occurrence count', () => {
      const recurrence = Recurrence.createDaily(1, { occurrenceCount: 5 }).value;
      const startDate = new Date('2024-01-01');

      const occurrences = recurrence.generateOccurrences(startDate, 100);

      expect(occurrences).toHaveLength(5);
    });

    it('should skip exception dates', () => {
      const exception = new Date('2024-01-03');
      const recurrence = Recurrence.createDaily().value.withException(exception);
      const startDate = new Date('2024-01-01');

      const occurrences = recurrence.generateOccurrences(startDate, 5);

      const hasException = occurrences.some(
        (d) =>
          d.getFullYear() === exception.getFullYear() &&
          d.getMonth() === exception.getMonth() &&
          d.getDate() === exception.getDate()
      );

      expect(hasException).toBe(false);
    });

    it('should generate monthly occurrences on correct day', () => {
      const recurrence = Recurrence.createMonthly(15).value;
      const startDate = new Date('2024-01-15');

      const occurrences = recurrence.generateOccurrences(startDate, 3);

      occurrences.forEach((date) => {
        expect(date.getDate()).toBe(15);
      });
    });

    it('should generate yearly occurrences', () => {
      const recurrence = Recurrence.createYearly(7, 4).value; // July 4th
      const startDate = new Date('2024-07-04');

      const occurrences = recurrence.generateOccurrences(startDate, 3);

      occurrences.forEach((date) => {
        expect(date.getMonth()).toBe(6); // July (0-indexed)
        expect(date.getDate()).toBe(4);
      });
    });
  });

  describe('describe()', () => {
    it('should describe daily recurrence', () => {
      const recurrence = Recurrence.createDaily().value;
      expect(recurrence.describe()).toBe('Daily');
    });

    it('should describe every N days', () => {
      const recurrence = Recurrence.createDaily(3).value;
      expect(recurrence.describe()).toBe('Every 3 days');
    });

    it('should describe weekly recurrence', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY', 'FRIDAY']).value;
      expect(recurrence.describe()).toContain('Weekly on');
      expect(recurrence.describe()).toContain('MONDAY');
      expect(recurrence.describe()).toContain('FRIDAY');
    });

    it('should describe bi-weekly recurrence', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY'], 2).value;
      expect(recurrence.describe()).toContain('Every 2 weeks');
    });

    it('should describe monthly recurrence', () => {
      const recurrence = Recurrence.createMonthly(15).value;
      expect(recurrence.describe()).toContain('Monthly');
      expect(recurrence.describe()).toContain('15');
    });

    it('should describe every N months', () => {
      const recurrence = Recurrence.createMonthly(1, 3).value;
      expect(recurrence.describe()).toContain('Every 3 months');
    });

    it('should describe yearly recurrence', () => {
      const recurrence = Recurrence.createYearly(12, 25).value;
      expect(recurrence.describe()).toContain('Yearly');
      expect(recurrence.describe()).toContain('12/25');
    });

    it('should describe custom recurrence', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
      }).value;
      expect(recurrence.describe()).toBe('Custom recurrence');
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute from persisted data', () => {
      const endDate = new Date('2024-12-31');
      const exceptionDates = [new Date('2024-07-04')];

      const recurrence = Recurrence.reconstitute({
        frequency: 'WEEKLY',
        interval: 2,
        daysOfWeek: ['MONDAY', 'WEDNESDAY'] as DayOfWeek[],
        endDate,
        exceptionDates,
      });

      expect(recurrence.frequency).toBe('WEEKLY');
      expect(recurrence.interval).toBe(2);
      expect(recurrence.daysOfWeek).toEqual(['MONDAY', 'WEDNESDAY']);
      expect(recurrence.endDate?.getTime()).toBe(endDate.getTime());
      expect(recurrence.exceptionDates).toHaveLength(1);
    });
  });

  describe('toValue() and toJSON()', () => {
    it('should serialize to value object', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY', 'FRIDAY'], 2).value;

      const value = recurrence.toValue();

      expect(value.frequency).toBe('WEEKLY');
      expect(value.interval).toBe(2);
      expect(value.daysOfWeek).toEqual(['MONDAY', 'FRIDAY']);
    });

    it('should serialize to JSON with dates as ISO strings', () => {
      const endDate = new Date('2024-12-31T00:00:00Z');
      const exception = new Date('2024-07-04T00:00:00Z');
      const recurrence = Recurrence.createDaily(1, { endDate }).value.withException(exception);

      const json = recurrence.toJSON();

      expect(json.endDate).toBe(endDate.toISOString());
      expect(json.exceptionDates).toContain(exception.toISOString());
    });
  });

  describe('Getters', () => {
    it('should return copy of daysOfWeek', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY']).value;

      const days = recurrence.daysOfWeek;
      days?.push('FRIDAY' as DayOfWeek);

      expect(recurrence.daysOfWeek).toEqual(['MONDAY']);
    });

    it('should return copy of exceptionDates', () => {
      const exception = new Date('2024-07-04');
      const recurrence = Recurrence.createDaily().value.withException(exception);

      const exceptions = recurrence.exceptionDates;
      exceptions.push(new Date('2024-12-25'));

      expect(recurrence.exceptionDates).toHaveLength(1);
    });

    it('should return copy of endDate', () => {
      const endDate = new Date('2024-12-31');
      const recurrence = Recurrence.createDaily(1, { endDate }).value;

      const retrieved = recurrence.endDate;
      retrieved?.setFullYear(2099);

      expect(recurrence.endDate?.getFullYear()).toBe(2024);
    });
  });

  describe('InvalidRecurrenceError', () => {
    it('should have correct error code', () => {
      const error = new InvalidRecurrenceError('test message');

      expect(error.code).toBe('INVALID_RECURRENCE');
      expect(error.message).toContain('test message');
    });
  });
});
