/**
 * Code Validator Tests
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Unit tests for MFA code validation utilities.
 * Follows TDD approach - tests written before implementation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCodeFormat,
  sanitizeCode,
  formatCodeForDisplay,
  isValidTotpCode,
  isValidBackupCode,
  getCodeError,
  CODE_LENGTH,
  BACKUP_CODE_LENGTH,
} from '../code-validator';

describe('code-validator', () => {
  // ============================================
  // validateCodeFormat - 6-digit format check
  // ============================================
  describe('validateCodeFormat', () => {
    it('returns true for valid 6-digit code', () => {
      expect(validateCodeFormat('123456')).toBe(true);
    });

    it('returns true for code with leading zeros', () => {
      expect(validateCodeFormat('012345')).toBe(true);
    });

    it('returns true for all zeros', () => {
      expect(validateCodeFormat('000000')).toBe(true);
    });

    it('returns false for code shorter than 6 digits', () => {
      expect(validateCodeFormat('12345')).toBe(false);
      expect(validateCodeFormat('1234')).toBe(false);
      expect(validateCodeFormat('1')).toBe(false);
      expect(validateCodeFormat('')).toBe(false);
    });

    it('returns false for code longer than 6 digits', () => {
      expect(validateCodeFormat('1234567')).toBe(false);
      expect(validateCodeFormat('12345678')).toBe(false);
    });

    it('returns false for code with non-digit characters', () => {
      expect(validateCodeFormat('12345a')).toBe(false);
      expect(validateCodeFormat('abcdef')).toBe(false);
      expect(validateCodeFormat('123-456')).toBe(false);
      expect(validateCodeFormat('123 456')).toBe(false);
    });
  });

  // ============================================
  // sanitizeCode - Remove non-digits
  // ============================================
  describe('sanitizeCode', () => {
    it('removes spaces from code', () => {
      expect(sanitizeCode('123 456')).toBe('123456');
    });

    it('removes dashes from code', () => {
      expect(sanitizeCode('123-456')).toBe('123456');
    });

    it('removes mixed whitespace and dashes', () => {
      expect(sanitizeCode('1 2 3 - 4 5 6')).toBe('123456');
    });

    it('removes letters from code', () => {
      expect(sanitizeCode('abc123def456')).toBe('123456');
    });

    it('handles empty string', () => {
      expect(sanitizeCode('')).toBe('');
    });

    it('handles string with only non-digits', () => {
      expect(sanitizeCode('abcdef')).toBe('');
    });

    it('preserves leading zeros', () => {
      expect(sanitizeCode('0 1 2 3 4 5')).toBe('012345');
    });

    it('trims whitespace from input', () => {
      expect(sanitizeCode('  123456  ')).toBe('123456');
    });
  });

  // ============================================
  // formatCodeForDisplay - "123-456" format
  // ============================================
  describe('formatCodeForDisplay', () => {
    it('formats 6-digit code with dash in middle', () => {
      expect(formatCodeForDisplay('123456')).toBe('123-456');
    });

    it('formats code with leading zeros', () => {
      expect(formatCodeForDisplay('012345')).toBe('012-345');
    });

    it('returns original string for codes shorter than 6 digits', () => {
      expect(formatCodeForDisplay('123')).toBe('123');
      expect(formatCodeForDisplay('12345')).toBe('12345');
    });

    it('handles empty string', () => {
      expect(formatCodeForDisplay('')).toBe('');
    });

    it('formats longer codes by taking first 6 digits', () => {
      expect(formatCodeForDisplay('1234567')).toBe('123-456');
    });
  });

  // ============================================
  // isValidTotpCode - Full TOTP validation
  // ============================================
  describe('isValidTotpCode', () => {
    it('returns true for valid TOTP code', () => {
      expect(isValidTotpCode('123456')).toBe(true);
    });

    it('returns true for TOTP code with leading zeros', () => {
      expect(isValidTotpCode('012345')).toBe(true);
    });

    it('returns false for invalid format', () => {
      expect(isValidTotpCode('12345')).toBe(false);
      expect(isValidTotpCode('1234567')).toBe(false);
    });

    it('sanitizes input before validation', () => {
      expect(isValidTotpCode('123-456')).toBe(true);
      expect(isValidTotpCode('123 456')).toBe(true);
    });

    it('returns false for empty input', () => {
      expect(isValidTotpCode('')).toBe(false);
    });

    it('returns false for non-numeric input', () => {
      expect(isValidTotpCode('abcdef')).toBe(false);
    });
  });

  // ============================================
  // isValidBackupCode - Backup code format
  // ============================================
  describe('isValidBackupCode', () => {
    it('returns true for valid backup code format (alphanumeric)', () => {
      expect(isValidBackupCode('A1B2C3D4E5')).toBe(true);
    });

    it('returns true for lowercase backup code', () => {
      expect(isValidBackupCode('a1b2c3d4e5')).toBe(true);
    });

    it('returns true for all-numeric backup code', () => {
      expect(isValidBackupCode('1234567890')).toBe(true);
    });

    it('returns true for backup code with dash', () => {
      expect(isValidBackupCode('A1B2C-3D4E5')).toBe(true);
    });

    it('returns false for code that is too short', () => {
      expect(isValidBackupCode('A1B2C')).toBe(false);
    });

    it('returns false for code that is too long', () => {
      expect(isValidBackupCode('A1B2C3D4E5F6G7')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(isValidBackupCode('')).toBe(false);
    });

    it('returns false for code with special characters', () => {
      expect(isValidBackupCode('A1B2C@D4E5')).toBe(false);
    });
  });

  // ============================================
  // getCodeError - Error message or null
  // ============================================
  describe('getCodeError', () => {
    it('returns null for valid 6-digit code', () => {
      expect(getCodeError('123456')).toBeNull();
    });

    it('returns error for empty code', () => {
      expect(getCodeError('')).toBe('Please enter a verification code');
    });

    it('returns error for code that is too short', () => {
      expect(getCodeError('12345')).toBe('Code must be 6 digits');
    });

    it('returns error for code that is too long', () => {
      expect(getCodeError('1234567')).toBe('Code must be 6 digits');
    });

    it('returns error for non-numeric code', () => {
      expect(getCodeError('abcdef')).toBe('Code must contain only numbers');
    });

    it('returns null after sanitizing valid code with spaces', () => {
      expect(getCodeError('123 456')).toBeNull();
    });

    it('returns null after sanitizing valid code with dashes', () => {
      expect(getCodeError('123-456')).toBeNull();
    });
  });

  // ============================================
  // Constants
  // ============================================
  describe('constants', () => {
    it('exports CODE_LENGTH as 6', () => {
      expect(CODE_LENGTH).toBe(6);
    });

    it('exports BACKUP_CODE_LENGTH as 10', () => {
      expect(BACKUP_CODE_LENGTH).toBe(10);
    });
  });
});
