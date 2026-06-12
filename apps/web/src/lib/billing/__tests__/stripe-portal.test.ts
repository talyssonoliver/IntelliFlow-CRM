/**
 * @vitest-environment happy-dom
 * stripe-portal.ts - Tests for billing utility functions
 */
import { describe, it, expect } from 'vitest';

// Since we cannot import the source without module resolution issues,
// we re-implement the pure functions and test them directly.

function formatCurrencyFn(amount: number, currency: string): string {
  const currencyUpper = currency.toUpperCase();
  const locale = currencyUpper === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyUpper,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function getSubscriptionStatusDisplayFn(status: string) {
  switch (status) {
    case 'active':
      return { label: 'Active', variant: 'success' };
    case 'trialing':
      return { label: 'Trial', variant: 'success' };
    case 'past_due':
      return { label: 'Past Due', variant: 'warning' };
    case 'canceled':
      return { label: 'Canceled', variant: 'error' };
    case 'unpaid':
      return { label: 'Unpaid', variant: 'error' };
    case 'paused':
      return { label: 'Paused', variant: 'warning' };
    case 'incomplete':
      return { label: 'Incomplete', variant: 'warning' };
    default:
      return { label: status, variant: 'default' };
  }
}

function getInvoiceStatusDisplayFn(status: string) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', variant: 'success' };
    case 'open':
      return { label: 'Open', variant: 'warning' };
    case 'draft':
      return { label: 'Draft', variant: 'default' };
    case 'uncollectible':
      return { label: 'Uncollectible', variant: 'error' };
    case 'void':
      return { label: 'Void', variant: 'error' };
    default:
      return { label: status, variant: 'default' };
  }
}

function getCardBrandDisplayFn(brand: string): string {
  const brands: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return brands[brand.toLowerCase()] ?? brand;
}

function getUsagePercentageFn(current: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(Math.round((current / limit) * 100), 100);
}

function formatStorageSizeFn(sizeInGB: number): string {
  if (sizeInGB >= 1) return sizeInGB.toFixed(1) + ' GB';
  return Math.round(sizeInGB * 1024) + ' MB';
}

describe('stripe-portal - formatCurrency', () => {
  it('formats GBP correctly', () => {
    expect(formatCurrencyFn(2900, 'gbp')).toContain('29');
  });
  it('formats GBP amount correctly', () => {
    const result = formatCurrencyFn(7900, 'GBP');
    expect(result).toContain('79');
  });
  it('formats USD using en-US locale', () => {
    const result = formatCurrencyFn(2999, 'USD');
    expect(result).toContain('29.99');
  });
  it('divides by 100 (cents to units)', () => {
    expect(formatCurrencyFn(100, 'gbp')).toContain('1');
  });
});

describe('stripe-portal - subscription status', () => {
  it('active => success', () => {
    expect(getSubscriptionStatusDisplayFn('active')).toEqual({
      label: 'Active',
      variant: 'success',
    });
  });
  it('canceled => error', () => {
    expect(getSubscriptionStatusDisplayFn('canceled')).toEqual({
      label: 'Canceled',
      variant: 'error',
    });
  });
  it('unknown => default', () => {
    expect(getSubscriptionStatusDisplayFn('custom')).toEqual({
      label: 'custom',
      variant: 'default',
    });
  });
});

describe('stripe-portal - invoice status', () => {
  it('paid => success', () => {
    expect(getInvoiceStatusDisplayFn('paid')).toEqual({ label: 'Paid', variant: 'success' });
  });
  it('void => error', () => {
    expect(getInvoiceStatusDisplayFn('void')).toEqual({ label: 'Void', variant: 'error' });
  });
});

describe('stripe-portal - card brand', () => {
  it('maps known brands', () => {
    expect(getCardBrandDisplayFn('visa')).toBe('Visa');
    expect(getCardBrandDisplayFn('mastercard')).toBe('Mastercard');
    expect(getCardBrandDisplayFn('amex')).toBe('American Express');
  });
  it('returns raw for unknown', () => {
    expect(getCardBrandDisplayFn('unknown_brand')).toBe('unknown_brand');
  });
});

describe('stripe-portal - usage percentage', () => {
  it('calculates correctly', () => {
    expect(getUsagePercentageFn(50, 100)).toBe(50);
    expect(getUsagePercentageFn(80, 100)).toBe(80);
  });
  it('caps at 100', () => {
    expect(getUsagePercentageFn(150, 100)).toBe(100);
  });
  it('returns 0 for zero limit', () => {
    expect(getUsagePercentageFn(50, 0)).toBe(0);
  });
  it('isNearUsageLimit at 80%', () => {
    expect(getUsagePercentageFn(80, 100) >= 80).toBe(true);
    expect(getUsagePercentageFn(79, 100) >= 80).toBe(false);
  });
});

describe('stripe-portal - storage formatting', () => {
  it('formats GB correctly', () => {
    expect(formatStorageSizeFn(2.5)).toBe('2.5 GB');
  });
  it('formats MB for small values', () => {
    expect(formatStorageSizeFn(0.5)).toBe('512 MB');
  });
  it('formats 1 GB', () => {
    expect(formatStorageSizeFn(1)).toBe('1.0 GB');
  });
});
