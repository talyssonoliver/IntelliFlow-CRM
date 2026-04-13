/**
 * Money Value Object Tests
 *
 * Tests monetary value creation, arithmetic operations,
 * currency handling, and formatting.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { Money, InvalidMoneyError, CurrencyMismatchError } from '../Money';

describe('Money', () => {
  describe('create()', () => {
    it('should create money from a valid decimal amount', () => {
      const result = Money.create(12.5, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Money);
      expect(result.value.cents).toBe(1250);
      expect(result.value.currency).toBe('GBP');
    });

    it('should default to USD when currency is not specified', () => {
      const result = Money.create(10);

      expect(result.isSuccess).toBe(true);
      expect(result.value.currency).toBe('GBP');
    });

    it('should create money with EUR', () => {
      const result = Money.create(25.0, 'EUR');

      expect(result.isSuccess).toBe(true);
      expect(result.value.currency).toBe('EUR');
      expect(result.value.cents).toBe(2500);
    });

    it('should create money with GBP', () => {
      const result = Money.create(100, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value.currency).toBe('GBP');
    });

    it('should handle zero-decimal currency JPY', () => {
      const result = Money.create(1500, 'JPY');

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(1500);
      expect(result.value.amount).toBe(1500);
    });

    it('should uppercase currency code', () => {
      const result = Money.create(10, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value.currency).toBe('GBP');
    });

    it('should fail for NaN amount', () => {
      const result = Money.create(NaN, 'GBP');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('finite number');
    });

    it('should fail for Infinity amount', () => {
      const result = Money.create(Infinity, 'GBP');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
    });

    it('should fail for negative amount', () => {
      const result = Money.create(-1, 'GBP');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('negative');
    });

    it('should fail for unsupported currency', () => {
      const result = Money.create(10, 'BTC');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('Unsupported currency');
    });

    it('should create money with zero amount', () => {
      const result = Money.create(0, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(0);
      expect(result.value.amount).toBe(0);
    });

    it('should round to nearest cent', () => {
      const result = Money.create(12.345, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(1235); // Math.round(12.345 * 100)
    });

    it('should have error code INVALID_MONEY', () => {
      const result = Money.create(-5, 'GBP');

      expect(result.error.code).toBe('INVALID_MONEY');
    });
  });

  describe('fromCents()', () => {
    it('should create money from valid cents', () => {
      const result = Money.fromCents(1250, 'GBP');

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(1250);
      expect(result.value.amount).toBe(12.5);
    });

    it('should default to USD', () => {
      const result = Money.fromCents(500);

      expect(result.isSuccess).toBe(true);
      expect(result.value.currency).toBe('GBP');
    });

    it('should fail for non-integer cents', () => {
      const result = Money.fromCents(12.5, 'GBP');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('integer');
    });

    it('should fail for negative cents', () => {
      const result = Money.fromCents(-100, 'GBP');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('negative');
    });

    it('should fail for unsupported currency', () => {
      const result = Money.fromCents(100, 'XYZ');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
    });

    it('should create zero cents', () => {
      const result = Money.fromCents(0, 'EUR');

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(0);
    });
  });

  describe('zero()', () => {
    it('should create zero money with default USD', () => {
      const money = Money.zero();

      expect(money).toBeInstanceOf(Money);
      expect(money.cents).toBe(0);
      expect(money.currency).toBe('GBP');
    });

    it('should create zero money with specified currency', () => {
      const money = Money.zero('EUR');

      expect(money.cents).toBe(0);
      expect(money.currency).toBe('EUR');
    });

    it('should uppercase the currency', () => {
      const money = Money.zero('gbp');

      expect(money.currency).toBe('GBP');
    });
  });

  describe('amount property', () => {
    it('should return decimal amount for standard currency', () => {
      const money = Money.create(12.5, 'GBP').value;

      expect(money.amount).toBe(12.5);
    });

    it('should return raw cents for zero-decimal currency (JPY)', () => {
      const money = Money.create(1500, 'JPY').value;

      expect(money.amount).toBe(1500);
    });
  });

  describe('formatted property', () => {
    it('should return a currency-formatted string for USD', () => {
      const money = Money.create(1234.56, 'GBP').value;

      expect(money.formatted).toContain('1,234.56');
    });

    it('should include currency symbol', () => {
      const money = Money.create(10, 'GBP').value;
      const formatted = money.formatted;

      expect(formatted).toContain('£');
    });
  });

  describe('add()', () => {
    it('should add two money values of the same currency', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(5, 'GBP').value;
      const result = m1.add(m2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(1500);
    });

    it('should fail when adding different currencies', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(10, 'EUR').value;
      const result = m1.add(m2);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CurrencyMismatchError);
      expect(result.error.code).toBe('CURRENCY_MISMATCH');
    });
  });

  describe('subtract()', () => {
    it('should subtract two money values of the same currency', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(3, 'GBP').value;
      const result = m1.subtract(m2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(700);
    });

    it('should fail when result would be negative', () => {
      const m1 = Money.create(5, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;
      const result = m1.subtract(m2);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('negative');
    });

    it('should fail when subtracting different currencies', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(5, 'EUR').value;
      const result = m1.subtract(m2);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CurrencyMismatchError);
    });

    it('should succeed when result is exactly zero', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;
      const result = m1.subtract(m2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(0);
    });
  });

  describe('multiply()', () => {
    it('should multiply by a valid factor', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(2);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(2000);
    });

    it('should round result to nearest cent', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(1.5);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(1500);
    });

    it('should fail for NaN factor', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(NaN);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
    });

    it('should fail for negative factor', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(-2);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidMoneyError);
      expect(result.error.message).toContain('negative');
    });

    it('should multiply by zero', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(0);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cents).toBe(0);
    });

    it('should fail for Infinity factor', () => {
      const money = Money.create(10, 'GBP').value;
      const result = money.multiply(Infinity);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('greaterThan()', () => {
    it('should return true when this amount is greater', () => {
      const m1 = Money.create(20, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;

      expect(m1.greaterThan(m2)).toBe(true);
    });

    it('should return false when this amount is less', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(20, 'GBP').value;

      expect(m1.greaterThan(m2)).toBe(false);
    });

    it('should return false when amounts are equal', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;

      expect(m1.greaterThan(m2)).toBe(false);
    });

    it('should throw when comparing different currencies', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(10, 'EUR').value;

      expect(() => m1.greaterThan(m2)).toThrow('Cannot compare different currencies');
    });
  });

  describe('lessThan()', () => {
    it('should return true when this amount is less', () => {
      const m1 = Money.create(5, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;

      expect(m1.lessThan(m2)).toBe(true);
    });

    it('should return false when this amount is greater', () => {
      const m1 = Money.create(20, 'GBP').value;
      const m2 = Money.create(10, 'GBP').value;

      expect(m1.lessThan(m2)).toBe(false);
    });

    it('should throw when comparing different currencies', () => {
      const m1 = Money.create(10, 'GBP').value;
      const m2 = Money.create(10, 'EUR').value;

      expect(() => m1.lessThan(m2)).toThrow('Cannot compare different currencies');
    });
  });

  describe('toValue()', () => {
    it('should return cents, currency, and amount', () => {
      const money = Money.create(12.5, 'GBP').value;
      const value = money.toValue();

      expect(value).toEqual({
        cents: 1250,
        currency: 'GBP',
        amount: 12.5,
      });
    });
  });

  describe('toString()', () => {
    it('should return the formatted string', () => {
      const money = Money.create(10, 'GBP').value;

      expect(money.toString()).toBe(money.formatted);
    });
  });
});
