/**
 * Buffer Value Object Tests
 *
 * Tests the Buffer value object which represents buffer time
 * before and after an appointment for travel, preparation, or debrief.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { Buffer, InvalidBufferError } from '../Buffer';

describe('Buffer Value Object', () => {
  describe('create()', () => {
    it('should create a valid buffer with positive values', () => {
      const result = Buffer.create(15, 15);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(15);
      expect(result.value.afterMinutes).toBe(15);
    });

    it('should create a buffer with zero values', () => {
      const result = Buffer.create(0, 0);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(0);
      expect(result.value.afterMinutes).toBe(0);
    });

    it('should create asymmetric buffer', () => {
      const result = Buffer.create(30, 10);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(30);
      expect(result.value.afterMinutes).toBe(10);
    });

    it('should fail with negative before buffer', () => {
      const result = Buffer.create(-5, 15);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidBufferError);
      expect(result.error.message).toContain('Before buffer cannot be negative');
    });

    it('should fail with negative after buffer', () => {
      const result = Buffer.create(15, -5);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidBufferError);
      expect(result.error.message).toContain('After buffer cannot be negative');
    });

    it('should fail when before buffer exceeds 4 hours', () => {
      const result = Buffer.create(241, 0);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('240 minutes');
    });

    it('should fail when after buffer exceeds 4 hours', () => {
      const result = Buffer.create(0, 241);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('240 minutes');
    });

    it('should accept exactly 4 hours (240 minutes)', () => {
      const result = Buffer.create(240, 240);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(240);
      expect(result.value.afterMinutes).toBe(240);
    });
  });

  describe('createSymmetric()', () => {
    it('should create symmetric buffer', () => {
      const result = Buffer.createSymmetric(20);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(20);
      expect(result.value.afterMinutes).toBe(20);
    });

    it('should fail with invalid value', () => {
      const result = Buffer.createSymmetric(-10);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('none()', () => {
    it('should create a zero buffer', () => {
      const buffer = Buffer.none();

      expect(buffer.beforeMinutes).toBe(0);
      expect(buffer.afterMinutes).toBe(0);
      expect(buffer.totalMinutes).toBe(0);
    });
  });

  describe('travel()', () => {
    it('should create travel buffer with default 30 minutes', () => {
      const result = Buffer.travel();

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(30);
      expect(result.value.afterMinutes).toBe(30);
    });

    it('should create travel buffer with custom minutes', () => {
      const result = Buffer.travel(45);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(45);
      expect(result.value.afterMinutes).toBe(45);
    });
  });

  describe('preparation()', () => {
    it('should create preparation buffer with default 15 minutes', () => {
      const result = Buffer.preparation();

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(15);
      expect(result.value.afterMinutes).toBe(0);
    });

    it('should create preparation buffer with custom minutes', () => {
      const result = Buffer.preparation(30);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(30);
      expect(result.value.afterMinutes).toBe(0);
    });
  });

  describe('debrief()', () => {
    it('should create debrief buffer with default 15 minutes', () => {
      const result = Buffer.debrief();

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(0);
      expect(result.value.afterMinutes).toBe(15);
    });

    it('should create debrief buffer with custom minutes', () => {
      const result = Buffer.debrief(25);

      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(0);
      expect(result.value.afterMinutes).toBe(25);
    });
  });

  describe('totalMinutes', () => {
    it('should calculate total buffer time', () => {
      const buffer = Buffer.create(15, 20).value;

      expect(buffer.totalMinutes).toBe(35);
    });

    it('should return 0 for no buffer', () => {
      const buffer = Buffer.none();

      expect(buffer.totalMinutes).toBe(0);
    });
  });

  describe('adjustStartTime()', () => {
    it('should adjust start time by subtracting before buffer', () => {
      const buffer = Buffer.create(30, 0).value;
      const startTime = new Date('2024-01-15T10:00:00Z');

      const adjusted = buffer.adjustStartTime(startTime);

      expect(adjusted.getTime()).toBe(new Date('2024-01-15T09:30:00Z').getTime());
    });

    it('should not change start time with zero buffer', () => {
      const buffer = Buffer.none();
      const startTime = new Date('2024-01-15T10:00:00Z');

      const adjusted = buffer.adjustStartTime(startTime);

      expect(adjusted.getTime()).toBe(startTime.getTime());
    });
  });

  describe('adjustEndTime()', () => {
    it('should adjust end time by adding after buffer', () => {
      const buffer = Buffer.create(0, 30).value;
      const endTime = new Date('2024-01-15T11:00:00Z');

      const adjusted = buffer.adjustEndTime(endTime);

      expect(adjusted.getTime()).toBe(new Date('2024-01-15T11:30:00Z').getTime());
    });

    it('should not change end time with zero buffer', () => {
      const buffer = Buffer.none();
      const endTime = new Date('2024-01-15T11:00:00Z');

      const adjusted = buffer.adjustEndTime(endTime);

      expect(adjusted.getTime()).toBe(endTime.getTime());
    });
  });

  describe('hasValue()', () => {
    it('should return true when before buffer has value', () => {
      const buffer = Buffer.create(15, 0).value;

      expect(buffer.hasValue()).toBe(true);
    });

    it('should return true when after buffer has value', () => {
      const buffer = Buffer.create(0, 15).value;

      expect(buffer.hasValue()).toBe(true);
    });

    it('should return true when both have values', () => {
      const buffer = Buffer.create(15, 15).value;

      expect(buffer.hasValue()).toBe(true);
    });

    it('should return false when both are zero', () => {
      const buffer = Buffer.none();

      expect(buffer.hasValue()).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute from persisted values', () => {
      const buffer = Buffer.reconstitute(25, 35);

      expect(buffer.beforeMinutes).toBe(25);
      expect(buffer.afterMinutes).toBe(35);
    });
  });

  describe('toValue() and toJSON()', () => {
    it('should serialize to value object', () => {
      const buffer = Buffer.create(15, 20).value;

      const value = buffer.toValue();

      expect(value.beforeMinutes).toBe(15);
      expect(value.afterMinutes).toBe(20);
    });

    it('should serialize to JSON', () => {
      const buffer = Buffer.create(15, 20).value;

      const json = buffer.toJSON();

      expect(json).toEqual(buffer.toValue());
    });
  });

  describe('describe()', () => {
    it('should describe no buffer', () => {
      const buffer = Buffer.none();

      expect(buffer.describe()).toBe('No buffer');
    });

    it('should describe before buffer only', () => {
      const buffer = Buffer.create(15, 0).value;

      expect(buffer.describe()).toBe('15min before');
    });

    it('should describe after buffer only', () => {
      const buffer = Buffer.create(0, 15).value;

      expect(buffer.describe()).toBe('15min after');
    });

    it('should describe both buffers', () => {
      const buffer = Buffer.create(15, 20).value;

      expect(buffer.describe()).toBe('15min before, 20min after');
    });
  });

  describe('InvalidBufferError', () => {
    it('should have correct error code', () => {
      const error = new InvalidBufferError('test message');

      expect(error.code).toBe('INVALID_BUFFER');
      expect(error.message).toContain('test message');
    });
  });
});
