/**
 * @vitest-environment happy-dom
 * Supplementary tests for stripe-portal.ts
 *
 * Covers uncovered branches: formatBillingDate, formatBillingDateTime,
 * getCardBrandIcon, getPlanById, getPlanByPriceId, getAnnualSavingsPercent,
 * isNearUsageLimit, isAtUsageLimit, PLANS configuration, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatBillingDate,
  formatBillingDateTime,
  getSubscriptionStatusDisplay,
  getInvoiceStatusDisplay,
  getCardBrandDisplay,
  getCardBrandIcon,
  PLANS,
  getPlanById,
  getPlanByPriceId,
  getAnnualSavingsPercent,
  getUsagePercentage,
  isNearUsageLimit,
  isAtUsageLimit,
  formatStorageSize,
} from '../stripe-portal';

// ============================================================================
// formatBillingDate
// ============================================================================

describe('formatBillingDate', () => {
  it('formats a Date object', () => {
    const date = new Date('2026-01-15T12:00:00Z');
    const result = formatBillingDate(date);
    expect(result).toContain('15');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });

  it('formats a string date', () => {
    const result = formatBillingDate('2026-06-20T00:00:00Z');
    expect(result).toContain('20');
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
  });
});

// ============================================================================
// formatBillingDateTime
// ============================================================================

describe('formatBillingDateTime', () => {
  it('formats a Date object with time', () => {
    const date = new Date('2026-03-10T14:30:00Z');
    const result = formatBillingDateTime(date);
    expect(result).toContain('10');
    expect(result).toContain('Mar');
    expect(result).toContain('2026');
  });

  it('formats a string date with time', () => {
    const result = formatBillingDateTime('2026-12-25T08:15:00Z');
    expect(result).toContain('25');
    expect(result).toContain('Dec');
    expect(result).toContain('2026');
  });
});

// ============================================================================
// formatCurrency - additional branches
// ============================================================================

describe('formatCurrency - additional branches', () => {
  it('handles EUR currency (non-GBP locale)', () => {
    const result = formatCurrency(5000, 'eur');
    // en-US locale with EUR
    expect(result).toContain('50');
  });

  it('handles zero amount', () => {
    const result = formatCurrency(0, 'gbp');
    expect(result).toContain('0');
  });

  it('handles large amounts', () => {
    const result = formatCurrency(1000000, 'GBP');
    expect(result).toContain('10,000');
  });
});

// ============================================================================
// getSubscriptionStatusDisplay - remaining branches
// ============================================================================

describe('getSubscriptionStatusDisplay - remaining branches', () => {
  it('trialing => success', () => {
    expect(getSubscriptionStatusDisplay('trialing')).toEqual({
      label: 'Trial',
      variant: 'success',
    });
  });

  it('past_due => warning', () => {
    expect(getSubscriptionStatusDisplay('past_due')).toEqual({
      label: 'Past Due',
      variant: 'warning',
    });
  });

  it('unpaid => error', () => {
    expect(getSubscriptionStatusDisplay('unpaid')).toEqual({
      label: 'Unpaid',
      variant: 'error',
    });
  });

  it('paused => warning', () => {
    expect(getSubscriptionStatusDisplay('paused')).toEqual({
      label: 'Paused',
      variant: 'warning',
    });
  });

  it('incomplete => warning', () => {
    expect(getSubscriptionStatusDisplay('incomplete')).toEqual({
      label: 'Incomplete',
      variant: 'warning',
    });
  });
});

// ============================================================================
// getInvoiceStatusDisplay - remaining branches
// ============================================================================

describe('getInvoiceStatusDisplay - remaining branches', () => {
  it('open => warning', () => {
    expect(getInvoiceStatusDisplay('open')).toEqual({
      label: 'Open',
      variant: 'warning',
    });
  });

  it('draft => default', () => {
    expect(getInvoiceStatusDisplay('draft')).toEqual({
      label: 'Draft',
      variant: 'default',
    });
  });

  it('uncollectible => error', () => {
    expect(getInvoiceStatusDisplay('uncollectible')).toEqual({
      label: 'Uncollectible',
      variant: 'error',
    });
  });

  it('unknown status returns default variant with raw label', () => {
    expect(getInvoiceStatusDisplay('refunded')).toEqual({
      label: 'refunded',
      variant: 'default',
    });
  });
});

// ============================================================================
// getCardBrandDisplay - remaining brands
// ============================================================================

describe('getCardBrandDisplay - remaining brands', () => {
  it('discover => Discover', () => {
    expect(getCardBrandDisplay('discover')).toBe('Discover');
  });

  it('diners => Diners Club', () => {
    expect(getCardBrandDisplay('diners')).toBe('Diners Club');
  });

  it('jcb => JCB', () => {
    expect(getCardBrandDisplay('jcb')).toBe('JCB');
  });

  it('unionpay => UnionPay', () => {
    expect(getCardBrandDisplay('unionpay')).toBe('UnionPay');
  });

  it('handles uppercase input', () => {
    expect(getCardBrandDisplay('VISA')).toBe('Visa');
  });

  it('handles mixed case input', () => {
    expect(getCardBrandDisplay('MasterCard')).toBe('Mastercard');
  });
});

// ============================================================================
// getCardBrandIcon
// ============================================================================

describe('getCardBrandIcon', () => {
  it('returns credit_card for any brand', () => {
    expect(getCardBrandIcon('visa')).toBe('credit_card');
    expect(getCardBrandIcon('mastercard')).toBe('credit_card');
    expect(getCardBrandIcon('unknown')).toBe('credit_card');
  });
});

// ============================================================================
// PLANS configuration
// ============================================================================

describe('PLANS', () => {
  it('has exactly 3 plans', () => {
    expect(PLANS).toHaveLength(3);
  });

  it('has starter, professional, enterprise plans', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['starter', 'professional', 'enterprise']);
  });

  it('professional plan is marked as popular', () => {
    const pro = PLANS.find((p) => p.id === 'professional');
    expect(pro?.popular).toBe(true);
  });

  it('enterprise plan has unlimited users (null maxUsers)', () => {
    const enterprise = PLANS.find((p) => p.id === 'enterprise');
    expect(enterprise?.maxUsers).toBeNull();
  });

  it('all plans have GBP currency', () => {
    PLANS.forEach((plan) => {
      expect(plan.currency).toBe('GBP');
    });
  });

  it('annual price is less than 12x monthly price for all plans', () => {
    PLANS.forEach((plan) => {
      expect(plan.priceAnnual).toBeLessThan(plan.priceMonthly * 12);
    });
  });
});

// ============================================================================
// getPlanById
// ============================================================================

describe('getPlanById', () => {
  it('returns starter plan', () => {
    const plan = getPlanById('starter');
    expect(plan).toBeDefined();
    expect(plan?.name).toBe('Starter');
  });

  it('returns professional plan', () => {
    const plan = getPlanById('professional');
    expect(plan).toBeDefined();
    expect(plan?.name).toBe('Professional');
  });

  it('returns enterprise plan', () => {
    const plan = getPlanById('enterprise');
    expect(plan).toBeDefined();
    expect(plan?.name).toBe('Enterprise');
  });

  it('returns undefined for non-existent plan', () => {
    expect(getPlanById('nonexistent')).toBeUndefined();
  });
});

// ============================================================================
// getPlanByPriceId
// ============================================================================

describe('getPlanByPriceId', () => {
  it('returns starter plan by price ID', () => {
    const plan = getPlanByPriceId('price_starter_monthly');
    expect(plan).toBeDefined();
    expect(plan?.id).toBe('starter');
  });

  it('returns professional plan by price ID', () => {
    const plan = getPlanByPriceId('price_professional_monthly');
    expect(plan?.id).toBe('professional');
  });

  it('returns enterprise plan by price ID', () => {
    const plan = getPlanByPriceId('price_enterprise_monthly');
    expect(plan?.id).toBe('enterprise');
  });

  it('returns undefined for unknown price ID', () => {
    expect(getPlanByPriceId('price_unknown')).toBeUndefined();
  });
});

// ============================================================================
// getAnnualSavingsPercent
// ============================================================================

describe('getAnnualSavingsPercent', () => {
  it('calculates savings for starter plan', () => {
    const starter = PLANS.find((p) => p.id === 'starter')!;
    const savings = getAnnualSavingsPercent(starter);
    // Monthly: 2900*12=34800, Annual: 28800, Savings: 6000/34800 = ~17%
    expect(savings).toBeGreaterThan(0);
    expect(savings).toBeLessThan(100);
  });

  it('calculates savings for professional plan', () => {
    const pro = PLANS.find((p) => p.id === 'professional')!;
    const savings = getAnnualSavingsPercent(pro);
    expect(savings).toBeGreaterThan(0);
  });

  it('calculates savings for enterprise plan', () => {
    const enterprise = PLANS.find((p) => p.id === 'enterprise')!;
    const savings = getAnnualSavingsPercent(enterprise);
    expect(savings).toBeGreaterThan(0);
  });
});

// ============================================================================
// isNearUsageLimit
// ============================================================================

describe('isNearUsageLimit', () => {
  it('returns true when at exactly 80%', () => {
    expect(isNearUsageLimit(80, 100)).toBe(true);
  });

  it('returns true when above 80%', () => {
    expect(isNearUsageLimit(90, 100)).toBe(true);
  });

  it('returns false when below 80%', () => {
    expect(isNearUsageLimit(79, 100)).toBe(false);
  });

  it('returns true when at 100%', () => {
    expect(isNearUsageLimit(100, 100)).toBe(true);
  });

  it('returns false when limit is 0', () => {
    expect(isNearUsageLimit(0, 0)).toBe(false);
  });
});

// ============================================================================
// isAtUsageLimit
// ============================================================================

describe('isAtUsageLimit', () => {
  it('returns true when at exactly the limit', () => {
    expect(isAtUsageLimit(100, 100)).toBe(true);
  });

  it('returns true when above the limit', () => {
    expect(isAtUsageLimit(150, 100)).toBe(true);
  });

  it('returns false when below the limit', () => {
    expect(isAtUsageLimit(99, 100)).toBe(false);
  });

  it('returns true when limit is 0 and current is 0', () => {
    expect(isAtUsageLimit(0, 0)).toBe(true);
  });
});

// ============================================================================
// getUsagePercentage - additional edge cases
// ============================================================================

describe('getUsagePercentage - edge cases', () => {
  it('rounds to nearest integer', () => {
    expect(getUsagePercentage(33, 100)).toBe(33);
    expect(getUsagePercentage(1, 3)).toBe(33);
  });

  it('returns 100 when current exceeds limit by a lot', () => {
    expect(getUsagePercentage(500, 100)).toBe(100);
  });
});

// ============================================================================
// formatStorageSize - edge cases
// ============================================================================

describe('formatStorageSize - edge cases', () => {
  it('formats exactly 1 GB', () => {
    expect(formatStorageSize(1)).toBe('1.0 GB');
  });

  it('formats a very small size in MB', () => {
    expect(formatStorageSize(0.1)).toBe('102 MB');
  });

  it('formats very large GB value', () => {
    expect(formatStorageSize(100)).toBe('100.0 GB');
  });

  it('formats 0 GB', () => {
    expect(formatStorageSize(0)).toBe('0 MB');
  });
});
