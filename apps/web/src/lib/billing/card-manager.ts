/**
 * Card Manager Utilities
 *
 * Business logic for payment method management including
 * expiry checks, status helpers, and card display utilities.
 *
 * @implements PG-029 (Payment Methods)
 */

import { getCardBrandDisplay, getCardBrandIcon, type BillingPaymentMethod } from './stripe-portal';

// ============================================
// Types
// ============================================

export interface CardStatus {
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiryLabel: string;
  statusVariant: 'success' | 'warning' | 'error' | 'default';
}

export interface CardDisplayInfo {
  brandName: string;
  brandIcon: string;
  last4: string;
  expiry: string;
  status: CardStatus;
  isDefault: boolean;
}

export type CardActionResult = {
  ok: true;
  message: string;
} | {
  ok: false;
  error: string;
};

// ============================================
// Constants
// ============================================

const EXPIRING_SOON_MONTHS = 3;

// ============================================
// Expiry Helpers
// ============================================

/**
 * Check if a card is expired
 */
export function isCardExpired(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const currentYear = now.getFullYear();

  // Convert 2-digit year to 4-digit if needed
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;

  if (fullYear < currentYear) {
    return true;
  }

  if (fullYear === currentYear && expMonth < currentMonth) {
    return true;
  }

  return false;
}

/**
 * Check if a card is expiring soon (within N months)
 */
export function isCardExpiringSoon(
  expMonth: number,
  expYear: number,
  monthsAhead: number = EXPIRING_SOON_MONTHS
): boolean {
  if (isCardExpired(expMonth, expYear)) {
    return false; // Already expired, not "expiring soon"
  }

  const now = new Date();
  const futureDate = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);

  // Convert 2-digit year to 4-digit if needed
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;

  // Card expiry date (end of month)
  const expiryDate = new Date(fullYear, expMonth, 0); // Last day of expMonth

  return expiryDate <= futureDate;
}

/**
 * Format card expiry for display (e.g., "12/2026")
 */
export function formatCardExpiry(expMonth: number, expYear: number): string {
  const monthStr = expMonth.toString().padStart(2, '0');
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;
  return `${monthStr}/${fullYear}`;
}

/**
 * Get months until card expires
 */
export function getMonthsUntilExpiry(expMonth: number, expYear: number): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;

  const monthsRemaining = (fullYear - currentYear) * 12 + (expMonth - currentMonth);
  return Math.max(0, monthsRemaining);
}

// ============================================
// Card Status Helpers
// ============================================

/**
 * Get comprehensive card status
 */
export function getCardStatus(expMonth: number, expYear: number): CardStatus {
  const expired = isCardExpired(expMonth, expYear);
  const expiringSoon = isCardExpiringSoon(expMonth, expYear);

  let expiryLabel: string;
  let statusVariant: CardStatus['statusVariant'];

  if (expired) {
    expiryLabel = 'Expired';
    statusVariant = 'error';
  } else if (expiringSoon) {
    const months = getMonthsUntilExpiry(expMonth, expYear);
    expiryLabel = months === 1 ? 'Expires this month' : `Expires in ${months} months`;
    statusVariant = 'warning';
  } else {
    expiryLabel = `Expires ${formatCardExpiry(expMonth, expYear)}`;
    statusVariant = 'success';
  }

  return {
    isExpired: expired,
    isExpiringSoon: expiringSoon,
    expiryLabel,
    statusVariant,
  };
}

// ============================================
// Card Display Helpers
// ============================================

/**
 * Get full display info for a payment method
 */
export function getCardDisplayInfo(paymentMethod: BillingPaymentMethod): CardDisplayInfo | null {
  if (!paymentMethod.card) {
    return null;
  }

  const { brand, last4, expMonth, expYear } = paymentMethod.card;
  const status = getCardStatus(expMonth, expYear);

  return {
    brandName: getCardBrandDisplay(brand),
    brandIcon: getCardBrandIcon(brand),
    last4,
    expiry: formatCardExpiry(expMonth, expYear),
    status,
    isDefault: paymentMethod.isDefault,
  };
}

/**
 * Format card display string (e.g., "Visa ending in 4242")
 */
export function formatCardDisplayString(brand: string, last4: string): string {
  return `${getCardBrandDisplay(brand)} ending in ${last4}`;
}

/**
 * Format masked card number (e.g., "**** **** **** 4242")
 */
export function formatMaskedCardNumber(last4: string): string {
  return `**** **** **** ${last4}`;
}

// ============================================
// Card Action Helpers
// ============================================

/**
 * Validate card can be removed (not the only default)
 */
export function canRemoveCard(
  paymentMethodId: string,
  allPaymentMethods: BillingPaymentMethod[]
): { canRemove: boolean; reason?: string } {
  const card = allPaymentMethods.find((pm) => pm.id === paymentMethodId);

  if (!card) {
    return { canRemove: false, reason: 'Card not found' };
  }

  // If this is the default and it's the only card, warn user
  if (card.isDefault && allPaymentMethods.length === 1) {
    return {
      canRemove: true,
      reason: 'This is your only payment method. You may need to add another before removing.',
    };
  }

  // If this is the default, user should set another default first
  if (card.isDefault && allPaymentMethods.length > 1) {
    return {
      canRemove: true,
      reason: 'This is your default payment method. Another card will be set as default.',
    };
  }

  return { canRemove: true };
}

/**
 * Find the next default card after removing one
 */
export function getNextDefaultCard(
  removedCardId: string,
  allPaymentMethods: BillingPaymentMethod[]
): BillingPaymentMethod | null {
  const remaining = allPaymentMethods.filter((pm) => pm.id !== removedCardId);

  if (remaining.length === 0) {
    return null;
  }

  // Prefer non-expired cards
  const validCards = remaining.filter((pm) => {
    if (!pm.card) return false;
    return !isCardExpired(pm.card.expMonth, pm.card.expYear);
  });

  return validCards[0] ?? remaining[0];
}

// ============================================
// Card Sorting
// ============================================

/**
 * Sort payment methods: default first, then by expiry (newest first)
 */
export function sortPaymentMethods(paymentMethods: BillingPaymentMethod[]): BillingPaymentMethod[] {
  return [...paymentMethods].sort((a, b) => {
    // Default card always first
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;

    // Then sort by expiry (later expiry first)
    if (a.card && b.card) {
      const aYear = a.card.expYear < 100 ? 2000 + a.card.expYear : a.card.expYear;
      const bYear = b.card.expYear < 100 ? 2000 + b.card.expYear : b.card.expYear;

      if (aYear !== bYear) {
        return bYear - aYear; // Later year first
      }

      return b.card.expMonth - a.card.expMonth; // Later month first
    }

    return 0;
  });
}

// ============================================
// Exports for stripe-portal compatibility
// ============================================

// Re-export from stripe-portal for convenience
export { getCardBrandDisplay, getCardBrandIcon };
