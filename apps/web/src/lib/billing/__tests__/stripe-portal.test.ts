/**
 * @vitest-environment happy-dom
 * stripe-portal.ts billing display helpers, imported from the module. This file used to
 * re-implement them ("we cannot import the source without module resolution issues", which was
 * not true) and assert the copies (#1216). More branches: stripe-portal.supplementary.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatStorageSize,
  getCardBrandDisplay,
  getInvoiceStatusDisplay,
  getSubscriptionStatusDisplay,
  getUsagePercentage,
  isAtUsageLimit,
  isNearUsageLimit,
} from '../stripe-portal';

describe('formatCurrency', () => {
  it('formats pence as pounds in en-GB, whatever the currency case', () => {
    expect(formatCurrency(2900, 'gbp')).toBe('£29.00');
    expect(formatCurrency(7999, 'GBP')).toBe('£79.99');
    expect(formatCurrency(100, 'gbp')).toBe('£1.00');
  });

  it('formats other currencies in en-US', () => {
    expect(formatCurrency(2999, 'USD')).toBe('$29.99');
  });
});

describe('status displays', () => {
  it('maps subscription statuses, passing unknown ones through', () => {
    expect(getSubscriptionStatusDisplay('active')).toEqual({ label: 'Active', variant: 'success' });
    expect(getSubscriptionStatusDisplay('canceled')).toEqual({
      label: 'Canceled',
      variant: 'error',
    });
    expect(getSubscriptionStatusDisplay('custom')).toEqual({ label: 'custom', variant: 'default' });
  });

  it('maps invoice statuses', () => {
    expect(getInvoiceStatusDisplay('paid')).toEqual({ label: 'Paid', variant: 'success' });
    expect(getInvoiceStatusDisplay('void')).toEqual({ label: 'Void', variant: 'error' });
  });

  it('names known card brands and passes unknown ones through', () => {
    expect(getCardBrandDisplay('visa')).toBe('Visa');
    expect(getCardBrandDisplay('mastercard')).toBe('Mastercard');
    expect(getCardBrandDisplay('amex')).toBe('American Express');
    expect(getCardBrandDisplay('unknown_brand')).toBe('unknown_brand');
  });
});

describe('usage limits', () => {
  it('computes the percentage of the limit, capped at 100, and 0 without a limit', () => {
    expect(getUsagePercentage(50, 100)).toBe(50);
    expect(getUsagePercentage(150, 100)).toBe(100);
    expect(getUsagePercentage(50, 0)).toBe(0);
  });

  it('is near the limit from 80%, and at it from 100%', () => {
    expect(isNearUsageLimit(79, 100)).toBe(false);
    expect(isNearUsageLimit(80, 100)).toBe(true);
    expect(isAtUsageLimit(99, 100)).toBe(false);
    expect(isAtUsageLimit(100, 100)).toBe(true);
  });
});

describe('formatStorageSize', () => {
  it('shows GB from 1 GB, MB below it', () => {
    expect(formatStorageSize(2.5)).toBe('2.5 GB');
    expect(formatStorageSize(1)).toBe('1.0 GB');
    expect(formatStorageSize(0.5)).toBe('512 MB');
  });
});
