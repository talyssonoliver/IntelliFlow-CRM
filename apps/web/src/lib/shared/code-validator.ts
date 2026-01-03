/**
 * Code Validator Utilities
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Utilities for validating MFA verification codes (TOTP, SMS, Email, Backup).
 * Used by both standalone /mfa/verify page and inline MFA challenge flow.
 */

/** Standard TOTP/OTP code length */
export const CODE_LENGTH = 6;

/** Backup code length (alphanumeric) */
export const BACKUP_CODE_LENGTH = 10;

/**
 * Validates that a code is exactly 6 digits.
 *
 * @param code - The code to validate
 * @returns true if the code is a valid 6-digit string
 *
 * @example
 * validateCodeFormat('123456') // true
 * validateCodeFormat('12345')  // false (too short)
 * validateCodeFormat('123-456') // false (contains dash)
 */
export function validateCodeFormat(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Must be exactly 6 characters, all digits
  return /^\d{6}$/.test(code);
}

/**
 * Removes non-digit characters from input and trims whitespace.
 * Useful for normalizing user input before validation.
 *
 * @param input - The raw input string
 * @returns A string containing only digits
 *
 * @example
 * sanitizeCode('123-456')  // '123456'
 * sanitizeCode('123 456')  // '123456'
 * sanitizeCode('abc123')   // '123'
 */
export function sanitizeCode(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters
  return input.replace(/\D/g, '');
}

/**
 * Formats a code for display with a dash in the middle.
 *
 * @param code - The code to format (digits only)
 * @returns Formatted code like "123-456"
 *
 * @example
 * formatCodeForDisplay('123456') // '123-456'
 * formatCodeForDisplay('12345')  // '12345' (unchanged if < 6 digits)
 */
export function formatCodeForDisplay(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  // If code is less than 6 chars, return as-is
  if (code.length < CODE_LENGTH) {
    return code;
  }

  // Take first 6 digits and add dash in middle
  const first = code.slice(0, 3);
  const second = code.slice(3, 6);

  return `${first}-${second}`;
}

/**
 * Validates a TOTP code (Time-based One-Time Password).
 * Sanitizes input before validation, accepting formatted codes.
 *
 * @param code - The code to validate (may contain spaces/dashes)
 * @returns true if the sanitized code is a valid 6-digit TOTP
 *
 * @example
 * isValidTotpCode('123456')   // true
 * isValidTotpCode('123-456')  // true (sanitized)
 * isValidTotpCode('abcdef')   // false
 */
export function isValidTotpCode(code: string): boolean {
  const sanitized = sanitizeCode(code);
  return validateCodeFormat(sanitized);
}

/**
 * Validates a backup code format.
 * Backup codes are 10-character alphanumeric strings.
 * May contain a dash in the middle (e.g., "A1B2C-3D4E5").
 *
 * @param code - The backup code to validate
 * @returns true if the code is a valid backup code format
 *
 * @example
 * isValidBackupCode('A1B2C3D4E5')   // true
 * isValidBackupCode('A1B2C-3D4E5')  // true
 * isValidBackupCode('12345')        // false (too short)
 */
export function isValidBackupCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Remove dashes for validation
  const normalized = code.replace(/-/g, '');

  // Must be exactly 10 alphanumeric characters
  if (normalized.length !== BACKUP_CODE_LENGTH) {
    return false;
  }

  // Must be alphanumeric only (letters and numbers)
  return /^[a-zA-Z0-9]+$/.test(normalized);
}

/**
 * Returns a user-friendly error message for invalid codes.
 * Returns null if the code is valid.
 *
 * @param code - The code to validate
 * @returns Error message string or null if valid
 *
 * @example
 * getCodeError('123456')  // null (valid)
 * getCodeError('')        // 'Please enter a verification code'
 * getCodeError('12345')   // 'Code must be 6 digits'
 */
export function getCodeError(code: string): string | null {
  // Empty check
  if (!code || code.trim() === '') {
    return 'Please enter a verification code';
  }

  // Sanitize to check digit content
  const sanitized = sanitizeCode(code);

  // Check if there are any digits
  if (sanitized.length === 0) {
    return 'Code must contain only numbers';
  }

  // Check length after sanitization
  if (sanitized.length !== CODE_LENGTH) {
    return 'Code must be 6 digits';
  }

  // Valid code
  return null;
}
