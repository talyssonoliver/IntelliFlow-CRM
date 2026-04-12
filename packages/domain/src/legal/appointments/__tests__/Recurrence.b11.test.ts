/**
 * Recurrence - B11 coverage tests
 *
 * Targets uncovered branches:
 * - matchesPattern CUSTOM frequency: daysOfWeek check, dayOfMonth check, monthOfYear check
 * - matchesPattern default case (unknown frequency)
 * - nextDate CUSTOM case
 * - describe: yearly with interval > 1
 * - describe: default case
 * - generateOccurrences with upToDate parameter (no endDate, use upToDate)
 * - reconstitute from persistence
 */
import { describe, it, expect } from 'vitest';
import { Recurrence } from '../Recurrence';

describe('Recurrence - b11 branch coverage', () => {
  describe('CUSTOM frequency - matchesPattern', () => {
    it('should match when custom has daysOfWeek filter', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        daysOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
      }).value;

      // Generate from a Monday
      const monday = new Date('2026-03-09T10:00:00Z'); // Monday
      const occurrences = recurrence.generateOccurrences(monday, 10);

      // Should only include Mon/Wed/Fri
      for (const occ of occurrences) {
        const day = occ.getUTCDay();
        expect([1, 3, 5]).toContain(day); // Mon=1, Wed=3, Fri=5
      }
    });

    it('should match when custom has dayOfMonth filter', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        dayOfMonth: 15,
      }).value;

      const start = new Date('2026-01-01T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 5);

      for (const occ of occurrences) {
        expect(occ.getUTCDate()).toBe(15);
      }
    });

    it('should match when custom has monthOfYear filter', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        monthOfYear: 6, // June
      }).value;

      const start = new Date('2026-01-01T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 3);

      for (const occ of occurrences) {
        expect(occ.getUTCMonth() + 1).toBe(6);
      }
    });

    it('should reject dates not matching custom daysOfWeek', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        daysOfWeek: ['SATURDAY'],
      }).value;

      // Start on a Monday, should skip to Saturday
      const monday = new Date('2026-03-09T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(monday, 3);

      for (const occ of occurrences) {
        expect(occ.getUTCDay()).toBe(6); // Saturday
      }
    });

    it('should combine dayOfMonth and monthOfYear in custom', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
        dayOfMonth: 25,
        monthOfYear: 12, // December 25th
      }).value;

      const start = new Date('2025-01-01T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 3);

      for (const occ of occurrences) {
        expect(occ.getUTCMonth() + 1).toBe(12);
        expect(occ.getUTCDate()).toBe(25);
      }
    });
  });

  describe('describe - yearly with interval > 1', () => {
    it('should describe yearly with interval 2', () => {
      const recurrence = Recurrence.createYearly(3, 15, 2).value;
      const desc = recurrence.describe();
      expect(desc).toContain('Every 2 years');
      expect(desc).toContain('3/15');
    });

    it('should describe yearly with interval 1', () => {
      const recurrence = Recurrence.createYearly(6, 1).value;
      const desc = recurrence.describe();
      expect(desc).toContain('Yearly');
      expect(desc).toContain('6/1');
    });
  });

  describe('describe - CUSTOM frequency', () => {
    it('should return Custom recurrence description', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
      }).value;
      expect(recurrence.describe()).toBe('Custom recurrence');
    });
  });

  describe('generateOccurrences with upToDate', () => {
    it('should use upToDate when no endDate is set', () => {
      const recurrence = Recurrence.createDaily(1).value;
      const start = new Date('2026-01-01T10:00:00Z');
      const upTo = new Date('2026-01-05T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 100, upTo);

      expect(occurrences.length).toBe(5); // Jan 1-5
      expect(occurrences[occurrences.length - 1].getTime()).toBeLessThanOrEqual(upTo.getTime());
    });

    it('should respect endDate over upToDate when both set', () => {
      const endDate = new Date('2026-01-03T10:00:00Z');
      const recurrence = Recurrence.createDaily(1, { endDate }).value;
      const start = new Date('2026-01-01T10:00:00Z');
      const upTo = new Date('2026-01-10T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 100, upTo);

      expect(occurrences.length).toBe(3); // Jan 1-3
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from persistence props', () => {
      const endDate = new Date('2026-12-31T00:00:00Z');
      const exception = new Date('2026-06-15T00:00:00Z');
      const recurrence = Recurrence.reconstitute({
        frequency: 'WEEKLY',
        interval: 2,
        daysOfWeek: ['MONDAY', 'FRIDAY'],
        endDate,
        exceptionDates: [exception],
      });

      expect(recurrence.frequency).toBe('WEEKLY');
      expect(recurrence.interval).toBe(2);
      expect(recurrence.daysOfWeek).toEqual(['MONDAY', 'FRIDAY']);
      expect(recurrence.endDate).toBeDefined();
      expect(recurrence.exceptionDates.length).toBe(1);
    });

    it('should reconstitute without optional fields', () => {
      const recurrence = Recurrence.reconstitute({
        frequency: 'DAILY',
        interval: 1,
        exceptionDates: [],
      });

      expect(recurrence.frequency).toBe('DAILY');
      expect(recurrence.endDate).toBeUndefined();
    });
  });

  describe('nextDate - CUSTOM case', () => {
    it('should advance by 1 day for custom frequency', () => {
      const recurrence = Recurrence.createCustom({
        frequency: 'CUSTOM',
        interval: 1,
      }).value;

      const start = new Date('2026-03-01T10:00:00Z');
      const occurrences = recurrence.generateOccurrences(start, 3);

      // Custom iterates day by day
      expect(occurrences.length).toBe(3);
      const diff = occurrences[1].getTime() - occurrences[0].getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000); // 1 day
    });
  });

  describe('monthly describe', () => {
    it('should describe monthly with interval > 1', () => {
      const recurrence = Recurrence.createMonthly(15, 3).value;
      const desc = recurrence.describe();
      expect(desc).toContain('Every 3 months');
      expect(desc).toContain('day 15');
    });
  });

  describe('weekly describe', () => {
    it('should describe weekly with interval > 1', () => {
      const recurrence = Recurrence.createWeekly(['TUESDAY'], 2).value;
      const desc = recurrence.describe();
      expect(desc).toContain('Every 2 weeks');
      expect(desc).toContain('TUESDAY');
    });
  });

  describe('daily describe', () => {
    it('should describe daily with interval > 1', () => {
      const recurrence = Recurrence.createDaily(3).value;
      expect(recurrence.describe()).toBe('Every 3 days');
    });
  });
});
