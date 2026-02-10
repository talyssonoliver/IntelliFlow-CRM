import { describe, it, expect } from 'vitest';
import { LineItem } from '../LineItem';

describe('LineItem', () => {
  describe('LineItem.create', () => {
    it('should create a line item with valid props', () => {
      const result = LineItem.create({
        description: 'Monthly subscription',
        quantity: 1,
        unitPriceCents: 2999,
        currency: 'USD',
        type: 'SUBSCRIPTION',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.description).toBe('Monthly subscription');
      expect(result.value.quantity).toBe(1);
      expect(result.value.unitPrice.cents).toBe(2999);
      expect(result.value.type).toBe('SUBSCRIPTION');
    });

    it('should calculate total = quantity * unitPrice', () => {
      const result = LineItem.create({
        description: 'Hours of service',
        quantity: 5,
        unitPriceCents: 10000,
        currency: 'USD',
        type: 'USAGE',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.total.cents).toBe(50000);
    });

    it('should reject empty description', () => {
      const result = LineItem.create({
        description: '',
        quantity: 1,
        unitPriceCents: 1000,
        type: 'ONE_TIME',
      });
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LINE_ITEM');
    });

    it('should reject quantity <= 0', () => {
      const result = LineItem.create({
        description: 'Test item',
        quantity: 0,
        unitPriceCents: 1000,
        type: 'ONE_TIME',
      });
      expect(result.isFailure).toBe(true);
    });

    it('should reject negative unitPrice', () => {
      const result = LineItem.create({
        description: 'Test item',
        quantity: 1,
        unitPriceCents: -100,
        type: 'ONE_TIME',
      });
      expect(result.isFailure).toBe(true);
    });

    it('should handle fractional quantities', () => {
      const result = LineItem.create({
        description: '1.5 hours',
        quantity: 1.5,
        unitPriceCents: 10000,
        currency: 'USD',
        type: 'USAGE',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.total.cents).toBe(15000);
    });

    it('should create SUBSCRIPTION type', () => {
      const result = LineItem.create({
        description: 'Plan',
        quantity: 1,
        unitPriceCents: 4999,
        type: 'SUBSCRIPTION',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.type).toBe('SUBSCRIPTION');
    });

    it('should create ONE_TIME type', () => {
      const result = LineItem.create({
        description: 'Setup fee',
        quantity: 1,
        unitPriceCents: 5000,
        type: 'ONE_TIME',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.type).toBe('ONE_TIME');
    });

    it('should create CREDIT type', () => {
      const result = LineItem.create({
        description: 'Account credit',
        quantity: 1,
        unitPriceCents: 1000,
        type: 'CREDIT',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.type).toBe('CREDIT');
    });

    it('should create DISCOUNT type', () => {
      const result = LineItem.create({
        description: '10% discount',
        quantity: 1,
        unitPriceCents: 500,
        type: 'DISCOUNT',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.type).toBe('DISCOUNT');
    });
  });

  describe('LineItem.equals', () => {
    it('should be equal with same props', () => {
      const a = LineItem.create({ description: 'Item', quantity: 1, unitPriceCents: 100, type: 'ONE_TIME' });
      const b = LineItem.create({ description: 'Item', quantity: 1, unitPriceCents: 100, type: 'ONE_TIME' });
      expect(a.value.equals(b.value)).toBe(true);
    });

    it('should not be equal with different props', () => {
      const a = LineItem.create({ description: 'Item A', quantity: 1, unitPriceCents: 100, type: 'ONE_TIME' });
      const b = LineItem.create({ description: 'Item B', quantity: 2, unitPriceCents: 200, type: 'USAGE' });
      expect(a.value.equals(b.value)).toBe(false);
    });
  });

  describe('LineItem.toValue', () => {
    it('should serialize to plain object', () => {
      const item = LineItem.create({
        description: 'Test',
        quantity: 2,
        unitPriceCents: 5000,
        currency: 'USD',
        type: 'SUBSCRIPTION',
      }).value;

      const val = item.toValue();
      expect(val.description).toBe('Test');
      expect(val.quantity).toBe(2);
      expect(val.unitPriceCents).toBe(5000);
      expect(val.totalCents).toBe(10000);
      expect(val.currency).toBe('USD');
      expect(val.type).toBe('SUBSCRIPTION');
    });
  });
});
