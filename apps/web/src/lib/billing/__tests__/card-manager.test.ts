import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock stripe-portal so card-manager gets controlled brand display/icon fns.
 */
vi.mock('../stripe-portal', () => ({
  getCardBrandDisplay: (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
    };
    return brands[brand.toLowerCase()] ?? brand;
  },
  getCardBrandIcon: () => 'credit_card',
}));

import {
  isCardExpired,
  isCardExpiringSoon,
  formatCardExpiry,
  getMonthsUntilExpiry,
  getCardStatus,
  getCardDisplayInfo,
  formatCardDisplayString,
  formatMaskedCardNumber,
  canRemoveCard,
  getNextDefaultCard,
  sortPaymentMethods,
  getCardBrandDisplay,
  getCardBrandIcon,
} from '../card-manager';

import type { BillingPaymentMethod } from '../stripe-portal';

// Helper: get current month/year for date-relative tests
const now = new Date();
const currentMonth = now.getMonth() + 1; // 1-indexed
const currentYear = now.getFullYear();

// ============================================
// isCardExpired
// ============================================

describe('isCardExpired', () => {
  it('returns true for a card expired in a past year', () => {
    expect(isCardExpired(12, 2020)).toBe(true);
  });

  it('returns true for a card expired in a past month of current year', () => {
    if (currentMonth > 1) {
      expect(isCardExpired(currentMonth - 1, currentYear)).toBe(true);
    }
  });

  it('returns false for a card expiring in the current month', () => {
    expect(isCardExpired(currentMonth, currentYear)).toBe(false);
  });

  it('returns false for a card expiring in the future', () => {
    expect(isCardExpired(12, currentYear + 2)).toBe(false);
  });

  it('handles 2-digit years', () => {
    // 2-digit year 20 = 2020 which is in the past
    expect(isCardExpired(1, 20)).toBe(true);
  });

  it('handles 2-digit year that maps to the future', () => {
    // 2-digit year 99 = 2099 which is in the future
    expect(isCardExpired(1, 99)).toBe(false);
  });
});

// ============================================
// isCardExpiringSoon
// ============================================

describe('isCardExpiringSoon', () => {
  it('returns false for already expired cards', () => {
    expect(isCardExpiringSoon(1, 2020)).toBe(false);
  });

  it('returns true for a card expiring within the next 3 months', () => {
    // Find a month 2 months from now
    const futureDate = new Date(currentYear, now.getMonth() + 2, 1);
    const expMonth = futureDate.getMonth() + 1;
    const expYear = futureDate.getFullYear();
    expect(isCardExpiringSoon(expMonth, expYear)).toBe(true);
  });

  it('returns false for a card expiring far in the future', () => {
    expect(isCardExpiringSoon(12, currentYear + 5)).toBe(false);
  });

  it('respects custom monthsAhead parameter', () => {
    // Card expiring in 5 months
    const futureDate = new Date(currentYear, now.getMonth() + 5, 1);
    const expMonth = futureDate.getMonth() + 1;
    const expYear = futureDate.getFullYear();

    // Default 3 months: should not be expiring soon
    expect(isCardExpiringSoon(expMonth, expYear, 3)).toBe(false);
    // 6 months ahead: should be expiring soon
    expect(isCardExpiringSoon(expMonth, expYear, 6)).toBe(true);
  });

  it('handles 2-digit years', () => {
    // Year 99 = 2099 - far future
    expect(isCardExpiringSoon(6, 99)).toBe(false);
  });
});

// ============================================
// formatCardExpiry
// ============================================

describe('formatCardExpiry', () => {
  it('formats month and year correctly', () => {
    expect(formatCardExpiry(12, 2026)).toBe('12/2026');
  });

  it('pads single-digit months with zero', () => {
    expect(formatCardExpiry(3, 2026)).toBe('03/2026');
  });

  it('converts 2-digit year to 4-digit', () => {
    expect(formatCardExpiry(6, 28)).toBe('06/2028');
  });
});

// ============================================
// getMonthsUntilExpiry
// ============================================

describe('getMonthsUntilExpiry', () => {
  it('returns 0 for an expired card', () => {
    expect(getMonthsUntilExpiry(1, 2020)).toBe(0);
  });

  it('returns positive months for a future card', () => {
    const result = getMonthsUntilExpiry(currentMonth, currentYear + 1);
    expect(result).toBe(12);
  });

  it('returns 0 for a card expiring this month', () => {
    const result = getMonthsUntilExpiry(currentMonth, currentYear);
    expect(result).toBe(0);
  });

  it('handles 2-digit years', () => {
    // 2-digit year in far future
    const result = getMonthsUntilExpiry(currentMonth, 99);
    expect(result).toBeGreaterThan(0);
  });
});

// ============================================
// getCardStatus
// ============================================

describe('getCardStatus', () => {
  it('returns expired status for expired card', () => {
    const status = getCardStatus(1, 2020);
    expect(status.isExpired).toBe(true);
    expect(status.isExpiringSoon).toBe(false);
    expect(status.expiryLabel).toBe('Expired');
    expect(status.statusVariant).toBe('error');
  });

  it('returns expiring soon status for card within 3 months', () => {
    // Card expiring next month
    const futureDate = new Date(currentYear, now.getMonth() + 1, 1);
    const expMonth = futureDate.getMonth() + 1;
    const expYear = futureDate.getFullYear();

    const status = getCardStatus(expMonth, expYear);
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(true);
    expect(status.statusVariant).toBe('warning');
    expect(status.expiryLabel).toMatch(/Expires/);
  });

  it('returns success status for card far in the future', () => {
    const status = getCardStatus(12, currentYear + 5);
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(false);
    expect(status.statusVariant).toBe('success');
    expect(status.expiryLabel).toContain('Expires');
    expect(status.expiryLabel).toContain(`12/${currentYear + 5}`);
  });

  it('shows "Expires this month" when 1 month remaining', () => {
    // We need to construct a card expiring exactly 1 month from now.
    // getMonthsUntilExpiry returns 1 when exp is next month.
    const futureDate = new Date(currentYear, now.getMonth() + 1, 1);
    const expMonth = futureDate.getMonth() + 1;
    const expYear = futureDate.getFullYear();

    const months = getMonthsUntilExpiry(expMonth, expYear);
    const status = getCardStatus(expMonth, expYear);

    if (months === 1) {
      expect(status.expiryLabel).toBe('Expires this month');
    } else {
      // If not exactly 1, just check it's a warning
      expect(status.statusVariant).toBe('warning');
    }
  });
});

// ============================================
// getCardDisplayInfo
// ============================================

describe('getCardDisplayInfo', () => {
  it('returns null when payment method has no card', () => {
    const pm: BillingPaymentMethod = {
      id: 'pm_1',
      type: 'bank_transfer',
      isDefault: false,
    };
    expect(getCardDisplayInfo(pm)).toBeNull();
  });

  it('returns full display info for a valid card', () => {
    const pm: BillingPaymentMethod = {
      id: 'pm_1',
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: currentYear + 3,
      },
      isDefault: true,
    };

    const info = getCardDisplayInfo(pm);
    expect(info).not.toBeNull();
    expect(info!.brandName).toBe('Visa');
    expect(info!.brandIcon).toBe('credit_card');
    expect(info!.last4).toBe('4242');
    expect(info!.expiry).toBe(`12/${currentYear + 3}`);
    expect(info!.isDefault).toBe(true);
    expect(info!.status.isExpired).toBe(false);
  });
});

// ============================================
// formatCardDisplayString
// ============================================

describe('formatCardDisplayString', () => {
  it('formats brand and last4', () => {
    expect(formatCardDisplayString('visa', '4242')).toBe('Visa ending in 4242');
  });

  it('formats amex brand correctly', () => {
    expect(formatCardDisplayString('amex', '1234')).toBe('American Express ending in 1234');
  });

  it('passes through unknown brands', () => {
    expect(formatCardDisplayString('Diners', '0000')).toBe('Diners ending in 0000');
  });
});

// ============================================
// formatMaskedCardNumber
// ============================================

describe('formatMaskedCardNumber', () => {
  it('returns masked card number', () => {
    expect(formatMaskedCardNumber('4242')).toBe('**** **** **** 4242');
  });

  it('works with any 4 digits', () => {
    expect(formatMaskedCardNumber('9876')).toBe('**** **** **** 9876');
  });
});

// ============================================
// canRemoveCard
// ============================================

describe('canRemoveCard', () => {
  const makePM = (id: string, isDefault: boolean): BillingPaymentMethod => ({
    id,
    type: 'card',
    card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: currentYear + 3 },
    isDefault,
  });

  it('returns canRemove: false when card is not found', () => {
    const result = canRemoveCard('pm_nonexistent', [makePM('pm_1', true)]);
    expect(result.canRemove).toBe(false);
    expect(result.reason).toBe('Card not found');
  });

  it('warns when removing the only default card', () => {
    const result = canRemoveCard('pm_1', [makePM('pm_1', true)]);
    expect(result.canRemove).toBe(true);
    expect(result.reason).toContain('only payment method');
  });

  it('warns about default when multiple cards exist', () => {
    const result = canRemoveCard('pm_1', [makePM('pm_1', true), makePM('pm_2', false)]);
    expect(result.canRemove).toBe(true);
    expect(result.reason).toContain('default payment method');
  });

  it('allows removal of non-default card without reason', () => {
    const result = canRemoveCard('pm_2', [makePM('pm_1', true), makePM('pm_2', false)]);
    expect(result.canRemove).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// ============================================
// getNextDefaultCard
// ============================================

describe('getNextDefaultCard', () => {
  const makePM = (
    id: string,
    isDefault: boolean,
    expYear: number = currentYear + 3
  ): BillingPaymentMethod => ({
    id,
    type: 'card',
    card: { brand: 'visa', last4: '4242', expMonth: 6, expYear },
    isDefault,
  });

  it('returns null when no cards remain', () => {
    expect(getNextDefaultCard('pm_1', [makePM('pm_1', true)])).toBeNull();
  });

  it('prefers non-expired cards', () => {
    const methods = [
      makePM('pm_1', true),
      makePM('pm_2', false, 2020), // expired
      makePM('pm_3', false, currentYear + 2), // valid
    ];
    const result = getNextDefaultCard('pm_1', methods);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pm_3');
  });

  it('falls back to expired card if no valid cards exist', () => {
    const methods = [
      makePM('pm_1', true),
      makePM('pm_2', false, 2020), // expired
    ];
    const result = getNextDefaultCard('pm_1', methods);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pm_2');
  });

  it('returns first valid card when removed card is not default', () => {
    const methods = [
      makePM('pm_1', true),
      makePM('pm_2', false),
    ];
    const result = getNextDefaultCard('pm_2', methods);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pm_1');
  });
});

// ============================================
// sortPaymentMethods
// ============================================

describe('sortPaymentMethods', () => {
  const makePM = (
    id: string,
    isDefault: boolean,
    expMonth: number,
    expYear: number
  ): BillingPaymentMethod => ({
    id,
    type: 'card',
    card: { brand: 'visa', last4: '4242', expMonth, expYear },
    isDefault,
  });

  it('puts default card first', () => {
    const methods = [
      makePM('pm_1', false, 6, 2027),
      makePM('pm_2', true, 3, 2026),
    ];
    const sorted = sortPaymentMethods(methods);
    expect(sorted[0].id).toBe('pm_2');
    expect(sorted[1].id).toBe('pm_1');
  });

  it('sorts non-default cards by expiry year (later first)', () => {
    const methods = [
      makePM('pm_1', false, 6, 2026),
      makePM('pm_2', false, 6, 2028),
      makePM('pm_3', false, 6, 2027),
    ];
    const sorted = sortPaymentMethods(methods);
    expect(sorted.map((p) => p.id)).toEqual(['pm_2', 'pm_3', 'pm_1']);
  });

  it('sorts by month when years are the same', () => {
    const methods = [
      makePM('pm_1', false, 3, 2027),
      makePM('pm_2', false, 12, 2027),
      makePM('pm_3', false, 6, 2027),
    ];
    const sorted = sortPaymentMethods(methods);
    expect(sorted.map((p) => p.id)).toEqual(['pm_2', 'pm_3', 'pm_1']);
  });

  it('handles 2-digit years in sorting', () => {
    const methods = [
      makePM('pm_1', false, 6, 28), // 2028
      makePM('pm_2', false, 6, 27), // 2027
    ];
    const sorted = sortPaymentMethods(methods);
    expect(sorted[0].id).toBe('pm_1');
    expect(sorted[1].id).toBe('pm_2');
  });

  it('does not mutate original array', () => {
    const methods = [
      makePM('pm_1', false, 6, 2026),
      makePM('pm_2', true, 6, 2026),
    ];
    const originalOrder = methods.map((m) => m.id);
    sortPaymentMethods(methods);
    expect(methods.map((m) => m.id)).toEqual(originalOrder);
  });

  it('handles cards without card property', () => {
    const methods: BillingPaymentMethod[] = [
      { id: 'pm_1', type: 'bank', isDefault: false },
      makePM('pm_2', true, 6, 2027),
      { id: 'pm_3', type: 'bank', isDefault: false },
    ];
    const sorted = sortPaymentMethods(methods);
    expect(sorted[0].id).toBe('pm_2'); // default first
  });
});

// ============================================
// Re-exported functions
// ============================================

describe('re-exported functions', () => {
  it('exports getCardBrandDisplay', () => {
    expect(getCardBrandDisplay('visa')).toBe('Visa');
  });

  it('exports getCardBrandIcon', () => {
    expect(getCardBrandIcon('visa')).toBe('credit_card');
  });
});
