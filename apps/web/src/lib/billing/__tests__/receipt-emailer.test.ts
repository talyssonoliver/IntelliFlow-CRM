/**
 * Receipt Emailer Tests
 *
 * @implements PG-031 (Receipts)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  getEmailConfirmation,
  sendReceiptEmail,
  getReceiptEmailSubject,
} from '../receipt-emailer';

describe('receipt-emailer', () => {
  describe('isValidEmail', () => {
    it('returns true for valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('name.surname@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    it('returns false for invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('missing@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
    });
  });

  describe('getEmailConfirmation', () => {
    it('returns confirmation with email address', () => {
      const result = getEmailConfirmation('user@example.com');
      expect(result.title).toBe('Send Receipt');
      expect(result.message).toContain('user@example.com');
    });

    it('includes full email in message', () => {
      const email = 'test.user@company.co.uk';
      const result = getEmailConfirmation(email);
      expect(result.message).toBe(`Send a copy of this receipt to ${email}?`);
    });
  });

  describe('sendReceiptEmail', () => {
    it('returns success on valid input', async () => {
      const result = await sendReceiptEmail('rcpt_123', 'user@example.com');
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('returns success without email (uses customer default)', async () => {
      const result = await sendReceiptEmail('rcpt_123');
      expect(result.success).toBe(true);
    });

    it('returns error when receiptId is missing', async () => {
      const result = await sendReceiptEmail('', 'user@example.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Receipt ID is required');
    });

    it('returns error for invalid email format', async () => {
      const result = await sendReceiptEmail('rcpt_123', 'invalid-email');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('generates unique message IDs', async () => {
      const result1 = await sendReceiptEmail('rcpt_1', 'user@example.com');
      const result2 = await sendReceiptEmail('rcpt_2', 'user@example.com');

      expect(result1.messageId).not.toBe(result2.messageId);
    });
  });

  describe('getReceiptEmailSubject', () => {
    it('formats subject with receipt number', () => {
      const subject = getReceiptEmailSubject('RCP-2026-0001');
      expect(subject).toBe('Your Receipt RCP-2026-0001 from IntelliFlow');
    });
  });
});
