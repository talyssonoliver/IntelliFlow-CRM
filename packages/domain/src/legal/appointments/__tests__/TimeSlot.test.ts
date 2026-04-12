/**
 * TimeSlot Value Object Tests
 *
 * Tests the TimeSlot value object which represents a time period
 * with start and end times, including duration calculations and
 * overlap detection.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TimeSlot, InvalidTimeSlotError, TimeSlotConflictError } from '../TimeSlot';

describe('TimeSlot Value Object', () => {
  describe('create()', () => {
    it('should create a valid TimeSlot', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T10:00:00Z');

      const result = TimeSlot.create(start, end);

      expect(result.isSuccess).toBe(true);
      expect(result.value.startTime.getTime()).toBe(start.getTime());
      expect(result.value.endTime.getTime()).toBe(end.getTime());
    });

    it('should fail when start equals end', () => {
      const time = new Date('2024-01-15T09:00:00Z');

      const result = TimeSlot.create(time, time);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTimeSlotError);
      expect(result.error.message).toContain('Start time must be before end time');
    });

    it('should fail when start is after end', () => {
      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T09:00:00Z');

      const result = TimeSlot.create(start, end);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTimeSlotError);
    });

    it('should fail for duration exceeding 24 hours', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-16T10:00:00Z'); // 25 hours

      const result = TimeSlot.create(start, end);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('24 hours');
    });

    it('should fail for duration less than 5 minutes', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T09:04:00Z'); // 4 minutes

      const result = TimeSlot.create(start, end);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('5 minutes');
    });

    it('should accept exactly 5 minutes duration', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T09:05:00Z');

      const result = TimeSlot.create(start, end);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationMinutes).toBe(5);
    });

    it('should accept exactly 24 hours duration', () => {
      const start = new Date('2024-01-15T00:00:00Z');
      const end = new Date('2024-01-16T00:00:00Z');

      const result = TimeSlot.create(start, end);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationHours).toBe(24);
    });
  });

  describe('createFromDuration()', () => {
    it('should create TimeSlot from start time and duration', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const durationMinutes = 60;

      const result = TimeSlot.createFromDuration(start, durationMinutes);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationMinutes).toBe(60);
      expect(result.value.endTime.getTime()).toBe(new Date('2024-01-15T10:00:00Z').getTime());
    });

    it('should fail with zero duration', () => {
      const start = new Date('2024-01-15T09:00:00Z');

      const result = TimeSlot.createFromDuration(start, 0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('positive');
    });

    it('should fail with negative duration', () => {
      const start = new Date('2024-01-15T09:00:00Z');

      const result = TimeSlot.createFromDuration(start, -30);

      expect(result.isFailure).toBe(true);
    });

    it('should create 30-minute slot', () => {
      const start = new Date('2024-01-15T14:00:00Z');

      const result = TimeSlot.createFromDuration(start, 30);

      expect(result.isSuccess).toBe(true);
      expect(result.value.durationMinutes).toBe(30);
    });
  });

  describe('durationMinutes and durationHours', () => {
    it('should calculate duration in minutes correctly', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T10:30:00Z');

      const slot = TimeSlot.create(start, end).value;

      expect(slot.durationMinutes).toBe(90);
    });

    it('should calculate duration in hours correctly', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T11:00:00Z');

      const slot = TimeSlot.create(start, end).value;

      expect(slot.durationHours).toBe(2);
    });

    it('should handle fractional hours', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T10:30:00Z');

      const slot = TimeSlot.create(start, end).value;

      expect(slot.durationHours).toBe(1.5);
    });
  });

  describe('overlaps()', () => {
    it('should detect overlapping slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T09:30:00Z'),
        new Date('2024-01-15T10:30:00Z')
      ).value;

      expect(slot1.overlaps(slot2)).toBe(true);
      expect(slot2.overlaps(slot1)).toBe(true);
    });

    it('should not detect overlap for adjacent slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      expect(slot1.overlaps(slot2)).toBe(false);
      expect(slot2.overlaps(slot1)).toBe(false);
    });

    it('should not detect overlap for non-overlapping slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T11:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      expect(slot1.overlaps(slot2)).toBe(false);
    });

    it('should detect when one slot contains another', () => {
      const outer = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      const inner = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      expect(outer.overlaps(inner)).toBe(true);
      expect(inner.overlaps(outer)).toBe(true);
    });
  });

  describe('contains()', () => {
    it('should return true for time within slot', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const time = new Date('2024-01-15T09:30:00Z');

      expect(slot.contains(time)).toBe(true);
    });

    it('should return true for start time (inclusive)', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const time = new Date('2024-01-15T09:00:00Z');

      expect(slot.contains(time)).toBe(true);
    });

    it('should return false for end time (exclusive)', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const time = new Date('2024-01-15T10:00:00Z');

      expect(slot.contains(time)).toBe(false);
    });

    it('should return false for time before slot', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const time = new Date('2024-01-15T08:00:00Z');

      expect(slot.contains(time)).toBe(false);
    });

    it('should return false for time after slot', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const time = new Date('2024-01-15T11:00:00Z');

      expect(slot.contains(time)).toBe(false);
    });
  });

  describe('isWithin()', () => {
    it('should return true when fully within another slot', () => {
      const outer = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      const inner = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      expect(inner.isWithin(outer)).toBe(true);
    });

    it('should return true when exactly matching', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      expect(slot1.isWithin(slot2)).toBe(true);
    });

    it('should return false when extending past outer', () => {
      const outer = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      const extending = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      expect(extending.isWithin(outer)).toBe(false);
    });
  });

  describe('withBuffer()', () => {
    it('should add buffer time before and after', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      const buffered = slot.withBuffer(15, 15).value;

      expect(buffered.startTime.getTime()).toBe(new Date('2024-01-15T09:45:00Z').getTime());
      expect(buffered.endTime.getTime()).toBe(new Date('2024-01-15T11:15:00Z').getTime());
    });

    it('should handle asymmetric buffers', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      const buffered = slot.withBuffer(30, 10).value;

      expect(buffered.startTime.getTime()).toBe(new Date('2024-01-15T09:30:00Z').getTime());
      expect(buffered.endTime.getTime()).toBe(new Date('2024-01-15T11:10:00Z').getTime());
    });

    it('should handle zero buffers', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      const buffered = slot.withBuffer(0, 0).value;

      expect(buffered.startTime.getTime()).toBe(slot.startTime.getTime());
      expect(buffered.endTime.getTime()).toBe(slot.endTime.getTime());
    });
  });

  describe('Time Status Methods', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('isPast()', () => {
      it('should return true for past time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isPast()).toBe(true);
      });

      it('should return false for future time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T08:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isPast()).toBe(false);
      });

      it('should return false for current time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T09:30:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isPast()).toBe(false);
      });
    });

    describe('isCurrent()', () => {
      it('should return true when now is within slot', () => {
        vi.setSystemTime(new Date('2024-01-15T09:30:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isCurrent()).toBe(true);
      });

      it('should return false when now is before slot', () => {
        vi.setSystemTime(new Date('2024-01-15T08:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isCurrent()).toBe(false);
      });

      it('should return false when now is after slot', () => {
        vi.setSystemTime(new Date('2024-01-15T11:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isCurrent()).toBe(false);
      });
    });

    describe('isFuture()', () => {
      it('should return true for future time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T08:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isFuture()).toBe(true);
      });

      it('should return false for past time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isFuture()).toBe(false);
      });

      it('should return false for current time slot', () => {
        vi.setSystemTime(new Date('2024-01-15T09:30:00Z'));

        const slot = TimeSlot.create(
          new Date('2024-01-15T09:00:00Z'),
          new Date('2024-01-15T10:00:00Z')
        ).value;

        expect(slot.isFuture()).toBe(false);
      });
    });
  });

  describe('gapMinutes()', () => {
    it('should calculate gap between non-overlapping slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T11:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      expect(slot1.gapMinutes(slot2)).toBe(60);
    });

    it('should return zero gap for adjacent slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      ).value;

      expect(slot1.gapMinutes(slot2)).toBe(0);
    });

    it('should return -1 for overlapping slots', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T09:30:00Z'),
        new Date('2024-01-15T10:30:00Z')
      ).value;

      expect(slot1.gapMinutes(slot2)).toBe(-1);
    });

    it('should work when other slot is before', () => {
      const slot1 = TimeSlot.create(
        new Date('2024-01-15T11:00:00Z'),
        new Date('2024-01-15T12:00:00Z')
      ).value;

      const slot2 = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      expect(slot1.gapMinutes(slot2)).toBe(60);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute a TimeSlot from persisted data', () => {
      const start = new Date('2024-01-15T09:00:00Z');
      const end = new Date('2024-01-15T10:00:00Z');

      const slot = TimeSlot.reconstitute(start, end);

      expect(slot.startTime.getTime()).toBe(start.getTime());
      expect(slot.endTime.getTime()).toBe(end.getTime());
      expect(slot.durationMinutes).toBe(60);
    });
  });

  describe('toValue() and toJSON()', () => {
    it('should serialize to value object', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const value = slot.toValue();

      expect(value.startTime).toBe('2024-01-15T09:00:00.000Z');
      expect(value.endTime).toBe('2024-01-15T10:00:00.000Z');
      expect(value.durationMinutes).toBe(60);
    });

    it('should serialize to JSON', () => {
      const slot = TimeSlot.create(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T10:00:00Z')
      ).value;

      const json = slot.toJSON();

      expect(json).toEqual(slot.toValue());
    });
  });

  describe('Error Types', () => {
    it('InvalidTimeSlotError should have correct code', () => {
      const error = new InvalidTimeSlotError('test message');

      expect(error.code).toBe('INVALID_TIME_SLOT');
      expect(error.message).toContain('test message');
    });

    it('TimeSlotConflictError should have correct code', () => {
      const error = new TimeSlotConflictError('conflict message');

      expect(error.code).toBe('TIME_SLOT_CONFLICT');
      expect(error.message).toContain('conflict message');
    });
  });
});
