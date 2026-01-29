/**
 * Payment Processor Utilities
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Card validation, formatting, brand detection, and error handling
 * utilities for the checkout form. Follows PCI-compliant patterns
 * (no card data storage or logging).
 */

import type { CardBrand, PaymentErrorCode } from '@intelliflow/validators';

// ============================================
// Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CardDetails {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
}

export interface CardValidationResult {
  valid: boolean;
  errors: {
    number?: string;
    expiry?: string;
    cvc?: string;
    name?: string;
  };
}

// ============================================
// Constants
// ============================================

const ERROR_MESSAGES: Record<PaymentErrorCode | string, string> = {
  CARD_DECLINED: 'Your card was declined. Please try a different card.',
  EXPIRED_CARD: 'Your card has expired. Please use a valid card.',
  INSUFFICIENT_FUNDS: 'Insufficient funds. Please try a different card.',
  PROCESSING_ERROR: 'An error occurred processing your payment. Please try again.',
  VALIDATION_ERROR: 'Please check your card details and try again.',
  INVALID_CVC: 'Invalid CVC code. Please check and try again.',
  INVALID_EXPIRY: 'Invalid expiry date. Please check and try again.',
  INVALID_NUMBER: 'Invalid card number. Please check and try again.',
  RATE_LIMIT: 'Too many attempts. Please wait a moment and try again.',
};

const DECLINE_CODE_MESSAGES: Record<string, string> = {
  do_not_honor: 'Your card was declined. Please contact your bank.',
  fraudulent: 'This transaction was flagged. Please contact your bank.',
  lost_card: 'This card has been reported lost. Please use a different card.',
  stolen_card: 'This card has been reported stolen. Please use a different card.',
};

// ============================================
// Luhn Algorithm (Card Number Checksum)
// ============================================

function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length === 0) return false;

  // Reject all zeros (valid Luhn but not a real card)
  if (/^0+$/.test(digits)) return false;

  let sum = 0;
  let isSecond = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isSecond) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isSecond = !isSecond;
  }

  return sum % 10 === 0;
}

// ============================================
// Card Number Validation
// ============================================

export function validateCardNumber(cardNumber: string): ValidationResult {
  if (!cardNumber || cardNumber.trim() === '') {
    return { valid: false, error: 'Card number is required' };
  }

  const digits = cardNumber.replace(/[\s-]/g, '');

  if (!/^\d+$/.test(digits)) {
    return { valid: false, error: 'Card number must contain only digits' };
  }

  if (digits.length < 13 || digits.length > 19) {
    return { valid: false, error: 'Card number must be 13-19 digits' };
  }

  if (!luhnCheck(digits)) {
    return { valid: false, error: 'Invalid card number' };
  }

  return { valid: true };
}

// ============================================
// Expiry Date Validation
// ============================================

export function validateExpiry(expiry: string): ValidationResult {
  if (!expiry || expiry.trim() === '') {
    return { valid: false, error: 'Expiry date is required' };
  }

  // Remove non-numeric except /
  const cleaned = expiry.replace(/[^\d/-]/g, '').replace(/-/g, '/');

  // Extract month and year
  let month: number;
  let year: number;

  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
      return { valid: false, error: 'Invalid expiry format (MM/YY)' };
    }
    month = parseInt(parts[0], 10);
    year = parseInt(parts[1], 10);
  } else if (cleaned.length === 4) {
    month = parseInt(cleaned.slice(0, 2), 10);
    year = parseInt(cleaned.slice(2, 4), 10);
  } else {
    return { valid: false, error: 'Invalid expiry format (MM/YY)' };
  }

  if (isNaN(month) || isNaN(year)) {
    return { valid: false, error: 'Invalid expiry format (MM/YY)' };
  }

  if (month < 1 || month > 12) {
    return { valid: false, error: 'Invalid month' };
  }

  // Convert 2-digit year to 4-digit
  const fullYear = year < 100 ? 2000 + year : year;

  // Check if expired
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (fullYear < currentYear || (fullYear === currentYear && month < currentMonth)) {
    return { valid: false, error: 'Card has expired' };
  }

  return { valid: true };
}

// ============================================
// CVC Validation
// ============================================

export function validateCVC(cvc: string, brand: CardBrand): ValidationResult {
  if (!cvc || cvc.trim() === '') {
    return { valid: false, error: 'CVC is required' };
  }

  if (!/^\d+$/.test(cvc)) {
    return { valid: false, error: 'CVC must contain only digits' };
  }

  if (brand === 'amex' && cvc.length !== 4) {
    return { valid: false, error: 'CVC must be 4 digits for Amex' };
  }

  if (brand !== 'amex' && cvc.length !== 3) {
    return { valid: false, error: 'CVC must be 3 digits' };
  }

  return { valid: true };
}

// ============================================
// Card Number Formatting
// ============================================

export function formatCardNumber(value: string): string {
  if (!value) return '';

  const digits = value.replace(/\D/g, '');
  const brand = detectCardBrand(digits);

  // Amex: 4-6-5
  if (brand === 'amex') {
    const limited = digits.slice(0, 15);
    const parts: string[] = [];
    if (limited.length > 0) parts.push(limited.slice(0, 4));
    if (limited.length > 4) parts.push(limited.slice(4, 10));
    if (limited.length > 10) parts.push(limited.slice(10, 15));
    return parts.join(' ');
  }

  // Default: 4-4-4-4
  const limited = digits.slice(0, 16);
  const parts: string[] = [];
  for (let i = 0; i < limited.length; i += 4) {
    parts.push(limited.slice(i, i + 4));
  }
  return parts.join(' ');
}

// ============================================
// Expiry Date Formatting
// ============================================

export function formatExpiry(value: string): string {
  if (!value) return '';

  // Remove non-numeric
  let digits = value.replace(/\D/g, '');

  // Handle single digit month > 1 (e.g., "5" could be "05" or start of "12")
  if (digits.length === 1 && parseInt(digits, 10) > 1) {
    // Could be month like 5, but wait for more input
    return digits;
  }

  // Handle month validation during typing
  if (digits.length >= 2) {
    const potentialMonth = parseInt(digits.slice(0, 2), 10);
    if (potentialMonth > 12) {
      // Invalid 2-digit month - return single digit
      return digits.slice(0, 1);
    }
  }

  // Handle 3-digit input like '125' → interpret as month 1, year 25
  if (digits.length === 3) {
    const firstDigit = parseInt(digits[0], 10);
    // If first digit alone could be a month (1-9), and next two could be year
    if (firstDigit >= 1 && firstDigit <= 9) {
      return `0${digits[0]}/${digits.slice(1)}`;
    }
  }

  // Limit to 4 digits (MMYY)
  digits = digits.slice(0, 4);

  // Format with slash
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return digits;
}

// ============================================
// Card Brand Detection
// ============================================

export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\D/g, '');

  if (!digits || digits.length < 2) {
    return 'unknown';
  }

  // Visa: starts with 4
  if (/^4/.test(digits)) {
    return 'visa';
  }

  // Mastercard: starts with 51-55 or 2221-2720
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) {
    return 'mastercard';
  }

  // Amex: starts with 34 or 37
  if (/^3[47]/.test(digits)) {
    return 'amex';
  }

  // Discover: starts with 6011 or 65
  if (/^6011/.test(digits) || /^65/.test(digits)) {
    return 'discover';
  }

  // Diners Club: starts with 36 or 38
  if (/^3[68]/.test(digits)) {
    return 'diners';
  }

  // JCB: starts with 35
  if (/^35/.test(digits)) {
    return 'jcb';
  }

  // UnionPay: starts with 62
  if (/^62/.test(digits)) {
    return 'unionpay';
  }

  return 'unknown';
}

// ============================================
// Payment Error Messages
// ============================================

export function getPaymentErrorMessage(code: string, declineCode?: string): string {
  // Check for specific decline codes first
  if (code === 'CARD_DECLINED' && declineCode && DECLINE_CODE_MESSAGES[declineCode]) {
    return DECLINE_CODE_MESSAGES[declineCode];
  }

  // Return standard error message or generic fallback
  return ERROR_MESSAGES[code] || 'An unexpected error occurred. Please try again.';
}

// ============================================
// Full Card Details Validation
// ============================================

export function validateCardDetails(card: CardDetails): CardValidationResult {
  const errors: CardValidationResult['errors'] = {};

  // Validate card number
  const numberResult = validateCardNumber(card.number);
  if (!numberResult.valid) {
    errors.number = numberResult.error;
  }

  // Validate expiry
  const expiryResult = validateExpiry(card.expiry);
  if (!expiryResult.valid) {
    errors.expiry = expiryResult.error;
  }

  // Detect brand for CVC validation
  const brand = detectCardBrand(card.number);

  // Validate CVC
  const cvcResult = validateCVC(card.cvc, brand);
  if (!cvcResult.valid) {
    errors.cvc = cvcResult.error;
  }

  // Validate cardholder name
  const trimmedName = card.name.trim();
  if (!trimmedName) {
    errors.name = 'Cardholder name is required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
