/**
 * Payment Processor Tests
 *
 * IMPLEMENTS: PG-026 (Checkout)
 *
 * Tests for card validation, formatting, brand detection,
 * and error message utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCardNumber,
  validateExpiry,
  validateCVC,
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  getPaymentErrorMessage,
  validateCardDetails,
  type CardDetails,
} from '../payment-processor';

// ============================================
// Card Number Validation (Luhn Algorithm)
// ============================================

describe('validateCardNumber', () => {
  describe('valid card numbers', () => {
    it('should accept valid Visa card', () => {
      const result = validateCardNumber('4242424242424242');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid Mastercard', () => {
      const result = validateCardNumber('5555555555554444');
      expect(result.valid).toBe(true);
    });

    it('should accept valid Amex card', () => {
      const result = validateCardNumber('378282246310005');
      expect(result.valid).toBe(true);
    });

    it('should accept valid Discover card', () => {
      const result = validateCardNumber('6011111111111117');
      expect(result.valid).toBe(true);
    });

    it('should accept card number with spaces', () => {
      const result = validateCardNumber('4242 4242 4242 4242');
      expect(result.valid).toBe(true);
    });

    it('should accept card number with dashes', () => {
      const result = validateCardNumber('4242-4242-4242-4242');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid card numbers', () => {
    it('should reject empty string', () => {
      const result = validateCardNumber('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Card number is required');
    });

    it('should reject too short number', () => {
      const result = validateCardNumber('424242424242');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Card number must be 13-19 digits');
    });

    it('should reject too long number', () => {
      const result = validateCardNumber('42424242424242424242');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Card number must be 13-19 digits');
    });

    it('should reject non-numeric characters', () => {
      const result = validateCardNumber('4242abcd42424242');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Card number must contain only digits');
    });

    it('should reject invalid Luhn checksum', () => {
      const result = validateCardNumber('4242424242424241');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid card number');
    });

    it('should reject all zeros', () => {
      const result = validateCardNumber('0000000000000000');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid card number');
    });
  });
});

// ============================================
// Expiry Date Validation
// ============================================

describe('validateExpiry', () => {
  describe('valid expiry dates', () => {
    it('should accept future expiry MM/YY format', () => {
      const futureYear = new Date().getFullYear() + 1;
      const yy = String(futureYear).slice(-2);
      const result = validateExpiry(`12/${yy}`);
      expect(result.valid).toBe(true);
    });

    it('should accept current month if not expired', () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      const result = validateExpiry(`${month}/${year}`);
      expect(result.valid).toBe(true);
    });

    it('should accept MMYY format without slash', () => {
      const futureYear = new Date().getFullYear() + 1;
      const yy = String(futureYear).slice(-2);
      const result = validateExpiry(`12${yy}`);
      expect(result.valid).toBe(true);
    });

    it('should accept MM-YY format with dash', () => {
      const futureYear = new Date().getFullYear() + 1;
      const yy = String(futureYear).slice(-2);
      const result = validateExpiry(`12-${yy}`);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid expiry dates', () => {
    it('should reject empty string', () => {
      const result = validateExpiry('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expiry date is required');
    });

    it('should reject invalid month 00', () => {
      const result = validateExpiry('00/30');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid month');
    });

    it('should reject invalid month 13', () => {
      const result = validateExpiry('13/30');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid month');
    });

    it('should reject past expiry date', () => {
      const result = validateExpiry('01/20');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Card has expired');
    });

    it('should reject malformed expiry', () => {
      const result = validateExpiry('1/2030');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid expiry format (MM/YY)');
    });

    it('should reject non-numeric expiry', () => {
      const result = validateExpiry('ab/cd');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid expiry format (MM/YY)');
    });
  });
});

// ============================================
// CVC Validation
// ============================================

describe('validateCVC', () => {
  describe('valid CVC codes', () => {
    it('should accept 3-digit CVC for Visa', () => {
      const result = validateCVC('123', 'visa');
      expect(result.valid).toBe(true);
    });

    it('should accept 3-digit CVC for Mastercard', () => {
      const result = validateCVC('456', 'mastercard');
      expect(result.valid).toBe(true);
    });

    it('should accept 4-digit CVC for Amex', () => {
      const result = validateCVC('1234', 'amex');
      expect(result.valid).toBe(true);
    });

    it('should accept 3-digit CVC for unknown brand', () => {
      const result = validateCVC('123', 'unknown');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid CVC codes', () => {
    it('should reject empty CVC', () => {
      const result = validateCVC('', 'visa');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CVC is required');
    });

    it('should reject 2-digit CVC', () => {
      const result = validateCVC('12', 'visa');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CVC must be 3 digits');
    });

    it('should reject 4-digit CVC for non-Amex', () => {
      const result = validateCVC('1234', 'visa');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CVC must be 3 digits');
    });

    it('should reject 3-digit CVC for Amex', () => {
      const result = validateCVC('123', 'amex');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CVC must be 4 digits for Amex');
    });

    it('should reject non-numeric CVC', () => {
      const result = validateCVC('12a', 'visa');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CVC must contain only digits');
    });
  });
});

// ============================================
// Card Number Formatting
// ============================================

describe('formatCardNumber', () => {
  it('should format 16-digit number with spaces (4-4-4-4)', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
  });

  it('should format Amex number with spaces (4-6-5)', () => {
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });

  it('should strip non-numeric characters', () => {
    expect(formatCardNumber('4242-4242-4242-4242')).toBe('4242 4242 4242 4242');
  });

  it('should handle partial input', () => {
    expect(formatCardNumber('4242')).toBe('4242');
    expect(formatCardNumber('42424242')).toBe('4242 4242');
  });

  it('should truncate excess digits', () => {
    expect(formatCardNumber('424242424242424242424242')).toBe('4242 4242 4242 4242');
  });

  it('should return empty string for empty input', () => {
    expect(formatCardNumber('')).toBe('');
  });
});

// ============================================
// Expiry Date Formatting
// ============================================

describe('formatExpiry', () => {
  it('should format MMYY to MM/YY', () => {
    expect(formatExpiry('1225')).toBe('12/25');
  });

  it('should add leading zero for single digit month', () => {
    expect(formatExpiry('125')).toBe('01/25');
  });

  it('should auto-add slash after 2 digits', () => {
    expect(formatExpiry('12')).toBe('12/');
  });

  it('should handle input with existing slash', () => {
    expect(formatExpiry('12/25')).toBe('12/25');
  });

  it('should strip non-numeric except slash', () => {
    expect(formatExpiry('12-25')).toBe('12/25');
  });

  it('should truncate to max 5 characters', () => {
    expect(formatExpiry('1225999')).toBe('12/25');
  });

  it('should return empty string for empty input', () => {
    expect(formatExpiry('')).toBe('');
  });

  it('should handle month >12 by adjusting', () => {
    expect(formatExpiry('15')).toBe('1');
  });
});

// ============================================
// Card Brand Detection
// ============================================

describe('detectCardBrand', () => {
  describe('Visa', () => {
    it('should detect Visa starting with 4', () => {
      expect(detectCardBrand('4242424242424242')).toBe('visa');
    });

    it('should detect Visa with partial number', () => {
      expect(detectCardBrand('4242')).toBe('visa');
    });
  });

  describe('Mastercard', () => {
    it('should detect Mastercard starting with 51-55', () => {
      expect(detectCardBrand('5555555555554444')).toBe('mastercard');
      expect(detectCardBrand('5105105105105100')).toBe('mastercard');
    });

    it('should detect Mastercard starting with 2221-2720', () => {
      expect(detectCardBrand('2223000048400011')).toBe('mastercard');
    });
  });

  describe('American Express', () => {
    it('should detect Amex starting with 34', () => {
      expect(detectCardBrand('340000000000009')).toBe('amex');
    });

    it('should detect Amex starting with 37', () => {
      expect(detectCardBrand('378282246310005')).toBe('amex');
    });
  });

  describe('Discover', () => {
    it('should detect Discover starting with 6011', () => {
      expect(detectCardBrand('6011111111111117')).toBe('discover');
    });

    it('should detect Discover starting with 65', () => {
      expect(detectCardBrand('6500000000000002')).toBe('discover');
    });
  });

  describe('Diners Club', () => {
    it('should detect Diners starting with 36', () => {
      expect(detectCardBrand('36000000000008')).toBe('diners');
    });

    it('should detect Diners starting with 38', () => {
      expect(detectCardBrand('38000000000006')).toBe('diners');
    });
  });

  describe('JCB', () => {
    it('should detect JCB starting with 35', () => {
      expect(detectCardBrand('3530111333300000')).toBe('jcb');
    });
  });

  describe('UnionPay', () => {
    it('should detect UnionPay starting with 62', () => {
      expect(detectCardBrand('6200000000000005')).toBe('unionpay');
    });
  });

  describe('Unknown', () => {
    it('should return unknown for unrecognized prefix', () => {
      expect(detectCardBrand('9999999999999999')).toBe('unknown');
    });

    it('should return unknown for empty string', () => {
      expect(detectCardBrand('')).toBe('unknown');
    });

    it('should return unknown for single digit', () => {
      expect(detectCardBrand('1')).toBe('unknown');
    });
  });
});

// ============================================
// Payment Error Messages
// ============================================

describe('getPaymentErrorMessage', () => {
  it('should return message for CARD_DECLINED', () => {
    const message = getPaymentErrorMessage('CARD_DECLINED');
    expect(message).toBe('Your card was declined. Please try a different card.');
  });

  it('should return message for EXPIRED_CARD', () => {
    const message = getPaymentErrorMessage('EXPIRED_CARD');
    expect(message).toBe('Your card has expired. Please use a valid card.');
  });

  it('should return message for INSUFFICIENT_FUNDS', () => {
    const message = getPaymentErrorMessage('INSUFFICIENT_FUNDS');
    expect(message).toBe('Insufficient funds. Please try a different card.');
  });

  it('should return message for INVALID_CVC', () => {
    const message = getPaymentErrorMessage('INVALID_CVC');
    expect(message).toBe('Invalid CVC code. Please check and try again.');
  });

  it('should return message for INVALID_EXPIRY', () => {
    const message = getPaymentErrorMessage('INVALID_EXPIRY');
    expect(message).toBe('Invalid expiry date. Please check and try again.');
  });

  it('should return message for INVALID_NUMBER', () => {
    const message = getPaymentErrorMessage('INVALID_NUMBER');
    expect(message).toBe('Invalid card number. Please check and try again.');
  });

  it('should return message for PROCESSING_ERROR', () => {
    const message = getPaymentErrorMessage('PROCESSING_ERROR');
    expect(message).toBe('An error occurred processing your payment. Please try again.');
  });

  it('should return message for RATE_LIMIT', () => {
    const message = getPaymentErrorMessage('RATE_LIMIT');
    expect(message).toBe('Too many attempts. Please wait a moment and try again.');
  });

  it('should return message for VALIDATION_ERROR', () => {
    const message = getPaymentErrorMessage('VALIDATION_ERROR');
    expect(message).toBe('Please check your card details and try again.');
  });

  it('should return generic message for unknown error', () => {
    const message = getPaymentErrorMessage('UNKNOWN_ERROR');
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  describe('with decline codes', () => {
    it('should return specific message for do_not_honor decline', () => {
      const message = getPaymentErrorMessage('CARD_DECLINED', 'do_not_honor');
      expect(message).toBe('Your card was declined. Please contact your bank.');
    });

    it('should return specific message for fraudulent decline', () => {
      const message = getPaymentErrorMessage('CARD_DECLINED', 'fraudulent');
      expect(message).toBe('This transaction was flagged. Please contact your bank.');
    });

    it('should return specific message for lost_card decline', () => {
      const message = getPaymentErrorMessage('CARD_DECLINED', 'lost_card');
      expect(message).toBe('This card has been reported lost. Please use a different card.');
    });

    it('should return specific message for stolen_card decline', () => {
      const message = getPaymentErrorMessage('CARD_DECLINED', 'stolen_card');
      expect(message).toBe('This card has been reported stolen. Please use a different card.');
    });
  });
});

// ============================================
// Full Card Details Validation
// ============================================

describe('validateCardDetails', () => {
  const validCard: CardDetails = {
    number: '4242424242424242',
    expiry: '12/30',
    cvc: '123',
    name: 'John Doe',
  };

  it('should validate valid card details', () => {
    const result = validateCardDetails(validCard);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should return all field errors', () => {
    const result = validateCardDetails({
      number: '1234',
      expiry: '00/20',
      cvc: '12',
      name: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.number).toBeDefined();
    expect(result.errors.expiry).toBeDefined();
    expect(result.errors.cvc).toBeDefined();
    expect(result.errors.name).toBeDefined();
  });

  it('should validate card number', () => {
    const result = validateCardDetails({
      ...validCard,
      number: '1234567890123456',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.number).toBe('Invalid card number');
  });

  it('should validate expiry', () => {
    const result = validateCardDetails({
      ...validCard,
      expiry: '01/20',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.expiry).toBe('Card has expired');
  });

  it('should validate CVC for detected brand', () => {
    // Amex card with 3-digit CVC (should be 4)
    const result = validateCardDetails({
      ...validCard,
      number: '378282246310005',
      cvc: '123',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.cvc).toBe('CVC must be 4 digits for Amex');
  });

  it('should validate cardholder name', () => {
    const result = validateCardDetails({
      ...validCard,
      name: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Cardholder name is required');
  });

  it('should trim whitespace from name', () => {
    const result = validateCardDetails({
      ...validCard,
      name: '  John Doe  ',
    });
    expect(result.valid).toBe(true);
  });

  it('should reject name with only spaces', () => {
    const result = validateCardDetails({
      ...validCard,
      name: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Cardholder name is required');
  });
});
