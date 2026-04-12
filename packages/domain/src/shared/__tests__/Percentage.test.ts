/**
 * Percentage Value Object Tests
 *
 * Tests percentage creation, conversions, arithmetic operations,
 * and formatting.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { Percentage, InvalidPercentageError } from '../Percentage';

describe('Percentage', () => {
  describe('create()', () => {
    it('should create a valid percentage of 0', () => {
      const result = Percentage.create(0);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(0);
    });

    it('should create a valid percentage of 50', () => {
      const result = Percentage.create(50);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(50);
    });

    it('should create a valid percentage of 100', () => {
      const result = Percentage.create(100);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(100);
    });

    it('should create a valid percentage of 75.5', () => {
      const result = Percentage.create(75.5);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(75.5);
    });

    it('should round to 2 decimal places', () => {
      const result = Percentage.create(33.3333);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(33.33);
    });

    it('should fail for null', () => {
      const result = Percentage.create(null);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('null or undefined');
    });

    it('should fail for undefined', () => {
      const result = Percentage.create(undefined);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
    });

    it('should fail for NaN', () => {
      const result = Percentage.create(NaN);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('not a number');
    });

    it('should fail for Infinity', () => {
      const result = Percentage.create(Infinity);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('finite');
    });

    it('should fail for negative Infinity', () => {
      const result = Percentage.create(-Infinity);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
    });

    it('should fail for value below 0', () => {
      const result = Percentage.create(-1);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('>= 0');
    });

    it('should fail for value above 100', () => {
      const result = Percentage.create(101);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('<= 100');
    });

    it('should have error code INVALID_PERCENTAGE', () => {
      const result = Percentage.create(-5);

      expect(result.error.code).toBe('INVALID_PERCENTAGE');
    });
  });

  describe('fromDecimal()', () => {
    it('should create 50% from 0.5', () => {
      const result = Percentage.fromDecimal(0.5);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(50);
    });

    it('should create 100% from 1.0', () => {
      const result = Percentage.fromDecimal(1.0);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(100);
    });

    it('should create 0% from 0', () => {
      const result = Percentage.fromDecimal(0);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(0);
    });

    it('should fail for decimal below 0', () => {
      const result = Percentage.fromDecimal(-0.1);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
    });

    it('should fail for decimal above 1', () => {
      const result = Percentage.fromDecimal(1.1);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
    });
  });

  describe('fromFraction()', () => {
    it('should create 75% from 3/4', () => {
      const result = Percentage.fromFraction(3, 4);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(75);
    });

    it('should create 100% from 5/5', () => {
      const result = Percentage.fromFraction(5, 5);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(100);
    });

    it('should create 0% from 0/10', () => {
      const result = Percentage.fromFraction(0, 10);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(0);
    });

    it('should fail when denominator is 0', () => {
      const result = Percentage.fromFraction(3, 0);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('zero');
    });

    it('should fail when denominator is negative', () => {
      const result = Percentage.fromFraction(3, -4);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidPercentageError);
      expect(result.error.message).toContain('positive');
    });
  });

  describe('properties', () => {
    it('value should return the percentage number', () => {
      const pct = Percentage.create(75.5).value;

      expect(pct.value).toBe(75.5);
    });

    it('asDecimal should return the value divided by 100', () => {
      const pct = Percentage.create(75).value;

      expect(pct.asDecimal).toBe(0.75);
    });

    it('formatted should return value with % suffix', () => {
      const pct = Percentage.create(75.5).value;

      expect(pct.formatted).toBe('75.5%');
    });

    it('formatted should handle zero', () => {
      const pct = Percentage.create(0).value;

      expect(pct.formatted).toBe('0%');
    });

    it('formatted should handle 100', () => {
      const pct = Percentage.create(100).value;

      expect(pct.formatted).toBe('100%');
    });
  });

  describe('add()', () => {
    it('should add two percentages', () => {
      const p1 = Percentage.create(30).value;
      const p2 = Percentage.create(20).value;
      const result = p1.add(p2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(50);
    });

    it('should clamp to 100 when sum exceeds 100', () => {
      const p1 = Percentage.create(60).value;
      const p2 = Percentage.create(60).value;
      const result = p1.add(p2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(100);
    });
  });

  describe('subtract()', () => {
    it('should subtract two percentages', () => {
      const p1 = Percentage.create(80).value;
      const p2 = Percentage.create(30).value;
      const result = p1.subtract(p2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(50);
    });

    it('should clamp to 0 when difference is negative', () => {
      const p1 = Percentage.create(20).value;
      const p2 = Percentage.create(50).value;
      const result = p1.subtract(p2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(0);
    });
  });

  describe('multiply()', () => {
    it('should multiply by a scalar', () => {
      const pct = Percentage.create(50).value;
      const result = pct.multiply(1.5);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(75);
    });

    it('should clamp to 100 when product exceeds 100', () => {
      const pct = Percentage.create(60).value;
      const result = pct.multiply(3);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(100);
    });

    it('should clamp to 0 for negative scalar', () => {
      const pct = Percentage.create(50).value;
      const result = pct.multiply(-1);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(0);
    });

    it('should fail for NaN scalar', () => {
      const pct = Percentage.create(50).value;
      const result = pct.multiply(NaN);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('finite number');
    });

    it('should fail for Infinity scalar', () => {
      const pct = Percentage.create(50).value;
      const result = pct.multiply(Infinity);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('of()', () => {
    it('should calculate percentage of a number', () => {
      const pct = Percentage.create(75).value;

      expect(pct.of(200)).toBe(150);
    });

    it('should return 0 for 0% of any number', () => {
      const pct = Percentage.create(0).value;

      expect(pct.of(1000)).toBe(0);
    });

    it('should return the full number for 100%', () => {
      const pct = Percentage.create(100).value;

      expect(pct.of(42)).toBe(42);
    });
  });

  describe('isZero()', () => {
    it('should return true for 0%', () => {
      const pct = Percentage.create(0).value;

      expect(pct.isZero()).toBe(true);
    });

    it('should return false for non-zero', () => {
      const pct = Percentage.create(1).value;

      expect(pct.isZero()).toBe(false);
    });
  });

  describe('isFull()', () => {
    it('should return true for 100%', () => {
      const pct = Percentage.create(100).value;

      expect(pct.isFull()).toBe(true);
    });

    it('should return false for less than 100%', () => {
      const pct = Percentage.create(99).value;

      expect(pct.isFull()).toBe(false);
    });
  });

  describe('isGreaterThan()', () => {
    it('should return true when this is greater', () => {
      const p1 = Percentage.create(80).value;
      const p2 = Percentage.create(50).value;

      expect(p1.isGreaterThan(p2)).toBe(true);
    });

    it('should return false when this is less', () => {
      const p1 = Percentage.create(30).value;
      const p2 = Percentage.create(50).value;

      expect(p1.isGreaterThan(p2)).toBe(false);
    });

    it('should return false when equal', () => {
      const p1 = Percentage.create(50).value;
      const p2 = Percentage.create(50).value;

      expect(p1.isGreaterThan(p2)).toBe(false);
    });
  });

  describe('isLessThan()', () => {
    it('should return true when this is less', () => {
      const p1 = Percentage.create(30).value;
      const p2 = Percentage.create(50).value;

      expect(p1.isLessThan(p2)).toBe(true);
    });

    it('should return false when this is greater', () => {
      const p1 = Percentage.create(80).value;
      const p2 = Percentage.create(50).value;

      expect(p1.isLessThan(p2)).toBe(false);
    });
  });

  describe('formatWithPrecision()', () => {
    it('should format with 0 decimal places', () => {
      const pct = Percentage.create(75.5).value;

      expect(pct.formatWithPrecision(0)).toBe('76%');
    });

    it('should format with 1 decimal place', () => {
      const pct = Percentage.create(75.5).value;

      expect(pct.formatWithPrecision(1)).toBe('75.5%');
    });

    it('should format with 3 decimal places', () => {
      const pct = Percentage.create(33.33).value;

      expect(pct.formatWithPrecision(3)).toBe('33.330%');
    });
  });

  describe('toValue()', () => {
    it('should return the numeric value', () => {
      const pct = Percentage.create(42).value;

      expect(pct.toValue()).toBe(42);
    });
  });

  describe('toString()', () => {
    it('should return the formatted string', () => {
      const pct = Percentage.create(75.5).value;

      expect(pct.toString()).toBe('75.5%');
    });

    it('should equal formatted property', () => {
      const pct = Percentage.create(50).value;

      expect(pct.toString()).toBe(pct.formatted);
    });
  });
});
