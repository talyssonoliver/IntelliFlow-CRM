import { describe, it, expect } from 'vitest';
import { TaxRate } from '../TaxRate';
import { Money } from '../../../shared/Money';

describe('TaxRate', () => {
  describe('TaxRate.create', () => {
    it('should create with valid rate (20% VAT)', () => {
      const result = TaxRate.create(20, 'VAT', 'GB');
      expect(result.isSuccess).toBe(true);
      expect(result.value.rate).toBe(20);
      expect(result.value.type).toBe('VAT');
      expect(result.value.jurisdiction).toBe('GB');
    });

    it('should reject rate < 0', () => {
      const result = TaxRate.create(-1, 'VAT');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TAX_RATE');
    });

    it('should reject rate > 100', () => {
      const result = TaxRate.create(101, 'VAT');
      expect(result.isFailure).toBe(true);
    });

    it('should accept rate = 0 (NONE type)', () => {
      const result = TaxRate.create(0, 'NONE');
      expect(result.isSuccess).toBe(true);
      expect(result.value.rate).toBe(0);
    });

    it('should accept rate = 100', () => {
      const result = TaxRate.create(100, 'VAT');
      expect(result.isSuccess).toBe(true);
    });
  });

  describe('TaxRate.calculate', () => {
    it('should calculate 20% of $100 → $20', () => {
      const taxRate = TaxRate.create(20, 'VAT').value;
      const subtotal = Money.create(100, 'GBP').value;
      const tax = taxRate.calculate(subtotal);
      expect(tax.cents).toBe(2000);
    });

    it('should calculate 0% → $0', () => {
      const taxRate = TaxRate.create(0, 'NONE').value;
      const subtotal = Money.create(100, 'GBP').value;
      const tax = taxRate.calculate(subtotal);
      expect(tax.cents).toBe(0);
    });

    it('should calculate 7.25% of $150 → $10.88 (rounded)', () => {
      const taxRate = TaxRate.create(7.25, 'SALES_TAX', 'US-CA').value;
      const subtotal = Money.create(150, 'GBP').value;
      const tax = taxRate.calculate(subtotal);
      // 15000 * 0.0725 = 1087.5 → rounded to 1088
      expect(tax.cents).toBe(1088);
    });

    it('should handle zero subtotal → $0', () => {
      const taxRate = TaxRate.create(20, 'VAT').value;
      const subtotal = Money.zero('GBP');
      const tax = taxRate.calculate(subtotal);
      expect(tax.cents).toBe(0);
    });

    it('should handle large amounts without overflow', () => {
      const taxRate = TaxRate.create(20, 'VAT').value;
      const subtotal = Money.create(999999.99, 'GBP').value;
      const tax = taxRate.calculate(subtotal);
      expect(tax.cents).toBeGreaterThan(0);
    });
  });

  describe('TaxRate.zero', () => {
    it('should create a zero tax rate', () => {
      const taxRate = TaxRate.zero();
      expect(taxRate.rate).toBe(0);
      expect(taxRate.type).toBe('NONE');
    });
  });

  describe('TaxRate.toValue', () => {
    it('should serialize correctly', () => {
      const taxRate = TaxRate.create(20, 'VAT', 'GB').value;
      const val = taxRate.toValue();
      expect(val).toEqual({ rate: 20, type: 'VAT', jurisdiction: 'GB' });
    });
  });
});
