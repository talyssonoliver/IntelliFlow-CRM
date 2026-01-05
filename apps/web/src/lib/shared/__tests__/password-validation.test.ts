/**
 * Password Validation Utilities - Unit Tests
 *
 * IMPLEMENTS: PG-020 (Reset Password page)
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePasswordStrength,
  validatePassword,
  validatePasswordMatch,
  checkRequirement,
  getUnmetRequirements,
  getStrengthColors,
  getStrengthLabel,
  getStrengthWidth,
  MIN_PASSWORD_LENGTH,
  STRONG_PASSWORD_LENGTH,
  MAX_SCORE,
  PASSWORD_REQUIREMENTS,
  STRENGTH_CONFIG,
  type PasswordStrength,
} from '../password-validation';

// ============================================
// calculatePasswordStrength Tests
// ============================================

describe('calculatePasswordStrength', () => {
  it('returns weak for empty password', () => {
    const result = calculatePasswordStrength('');
    expect(result.strength).toBe('weak');
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.meetsMinimum).toBe(false);
    expect(result.feedback.length).toBeGreaterThan(0);
  });

  it('returns weak for short passwords', () => {
    const result = calculatePasswordStrength('abc');
    expect(result.strength).toBe('weak');
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.meetsMinimum).toBe(false);
  });

  it('returns weak for password with only lowercase', () => {
    const result = calculatePasswordStrength('password');
    expect(result.strength).toBe('weak');
    expect(result.meetsMinimum).toBe(false);
  });

  it('returns fair for 8+ chars with mixed case', () => {
    const result = calculatePasswordStrength('Password');
    expect(result.strength).toBe('fair');
    expect(result.score).toBe(3);
    expect(result.meetsMinimum).toBe(true);
  });

  it('returns good for mixed case with numbers', () => {
    const result = calculatePasswordStrength('Password1');
    expect(result.strength).toBe('good');
    expect(result.score).toBe(4);
    expect(result.meetsMinimum).toBe(true);
  });

  it('returns good for 8+ chars with all character types', () => {
    const result = calculatePasswordStrength('Pass1!ab');
    expect(result.strength).toBe('good');
    expect(result.score).toBe(5);
    expect(result.meetsMinimum).toBe(true);
  });

  it('returns strong for 12+ chars with all character types', () => {
    const result = calculatePasswordStrength('Password123!');
    expect(result.strength).toBe('strong');
    expect(result.score).toBe(6);
    expect(result.percentage).toBe(100);
    expect(result.meetsMinimum).toBe(true);
    expect(result.feedback).toHaveLength(0);
  });

  it('provides correct feedback for missing requirements', () => {
    const result = calculatePasswordStrength('abcdefgh');
    expect(result.feedback).toContain('Uppercase letter');
    expect(result.feedback).toContain('Number');
    expect(result.feedback).toContain('Special character (!@#$%^&*...)');
    expect(result.feedback).not.toContain('12+ characters (recommended)');
  });

  it('calculates percentage correctly', () => {
    const result1 = calculatePasswordStrength('');
    expect(result1.percentage).toBe(0);

    const result2 = calculatePasswordStrength('Password123!');
    expect(result2.percentage).toBe(100);

    const result3 = calculatePasswordStrength('password');
    expect(result3.percentage).toBe(Math.round((2 / MAX_SCORE) * 100));
  });
});

// ============================================
// validatePassword Tests
// ============================================

describe('validatePassword', () => {
  it('fails for empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password is required');
  });

  it('fails for passwords under 8 characters', () => {
    const result = validatePassword('Pass1!');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('at least 8 characters');
  });

  it('fails for weak passwords', () => {
    const result = validatePassword('password');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('too weak'))).toBe(true);
  });

  it('passes for fair passwords', () => {
    const result = validatePassword('Password');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes for good passwords', () => {
    const result = validatePassword('Password1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes for strong passwords', () => {
    const result = validatePassword('Password123!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================
// validatePasswordMatch Tests
// ============================================

describe('validatePasswordMatch', () => {
  it('fails for empty confirmation', () => {
    const result = validatePasswordMatch('Password123!', '');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Please confirm your password');
  });

  it('fails for mismatched passwords', () => {
    const result = validatePasswordMatch('Password123!', 'Password123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Passwords do not match');
  });

  it('passes for matching passwords', () => {
    const result = validatePasswordMatch('Password123!', 'Password123!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('is case sensitive', () => {
    const result = validatePasswordMatch('Password123!', 'password123!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Passwords do not match');
  });
});

// ============================================
// checkRequirement Tests
// ============================================

describe('checkRequirement', () => {
  it('returns false for unknown requirement', () => {
    expect(checkRequirement('Password123!', 'unknown')).toBe(false);
  });

  it('checks length requirement correctly', () => {
    expect(checkRequirement('short', 'length')).toBe(false);
    expect(checkRequirement('longenough', 'length')).toBe(true);
  });

  it('checks longLength requirement correctly', () => {
    expect(checkRequirement('short', 'longLength')).toBe(false);
    expect(checkRequirement('verylongpassword', 'longLength')).toBe(true);
  });

  it('checks lowercase requirement correctly', () => {
    expect(checkRequirement('UPPERCASE', 'lowercase')).toBe(false);
    expect(checkRequirement('lowercase', 'lowercase')).toBe(true);
  });

  it('checks uppercase requirement correctly', () => {
    expect(checkRequirement('lowercase', 'uppercase')).toBe(false);
    expect(checkRequirement('Uppercase', 'uppercase')).toBe(true);
  });

  it('checks number requirement correctly', () => {
    expect(checkRequirement('password', 'number')).toBe(false);
    expect(checkRequirement('password1', 'number')).toBe(true);
  });

  it('checks special requirement correctly', () => {
    expect(checkRequirement('password', 'special')).toBe(false);
    expect(checkRequirement('password!', 'special')).toBe(true);
    expect(checkRequirement('pass@word', 'special')).toBe(true);
  });
});

// ============================================
// getUnmetRequirements Tests
// ============================================

describe('getUnmetRequirements', () => {
  it('returns all requirements for empty password', () => {
    const unmet = getUnmetRequirements('');
    expect(unmet.length).toBe(5); // All except longLength
    expect(unmet.find((r) => r.id === 'longLength')).toBeUndefined();
  });

  it('returns unmet requirements correctly', () => {
    const unmet = getUnmetRequirements('password');
    const unmetIds = unmet.map((r) => r.id);
    expect(unmetIds).toContain('uppercase');
    expect(unmetIds).toContain('number');
    expect(unmetIds).toContain('special');
    expect(unmetIds).not.toContain('length');
    expect(unmetIds).not.toContain('lowercase');
  });

  it('returns empty array for strong password', () => {
    const unmet = getUnmetRequirements('Password123!');
    expect(unmet).toHaveLength(0);
  });

  it('never includes longLength in unmet requirements', () => {
    const unmet = getUnmetRequirements('short');
    expect(unmet.find((r) => r.id === 'longLength')).toBeUndefined();
  });
});

// ============================================
// UI Helper Tests
// ============================================

describe('getStrengthColors', () => {
  it('returns correct colors for each strength level', () => {
    const strengths: PasswordStrength[] = ['weak', 'fair', 'good', 'strong'];

    for (const strength of strengths) {
      const colors = getStrengthColors(strength);
      expect(colors.bar).toBe(STRENGTH_CONFIG[strength].color);
      expect(colors.text).toBe(STRENGTH_CONFIG[strength].textColor);
      expect(colors.bg).toBe(STRENGTH_CONFIG[strength].bgColor);
    }
  });
});

describe('getStrengthLabel', () => {
  it('returns correct labels for each strength level', () => {
    expect(getStrengthLabel('weak')).toBe('Weak');
    expect(getStrengthLabel('fair')).toBe('Fair');
    expect(getStrengthLabel('good')).toBe('Good');
    expect(getStrengthLabel('strong')).toBe('Strong');
  });
});

describe('getStrengthWidth', () => {
  it('returns correct width classes for each strength level', () => {
    expect(getStrengthWidth('weak')).toBe('w-1/4');
    expect(getStrengthWidth('fair')).toBe('w-2/4');
    expect(getStrengthWidth('good')).toBe('w-3/4');
    expect(getStrengthWidth('strong')).toBe('w-full');
  });
});

// ============================================
// Constants Tests
// ============================================

describe('Constants', () => {
  it('has correct MIN_PASSWORD_LENGTH', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('has correct STRONG_PASSWORD_LENGTH', () => {
    expect(STRONG_PASSWORD_LENGTH).toBe(12);
  });

  it('has correct MAX_SCORE', () => {
    expect(MAX_SCORE).toBe(6);
  });

  it('has 6 password requirements', () => {
    expect(PASSWORD_REQUIREMENTS).toHaveLength(6);
  });

  it('has 4 strength levels in STRENGTH_CONFIG', () => {
    expect(Object.keys(STRENGTH_CONFIG)).toHaveLength(4);
    expect(STRENGTH_CONFIG).toHaveProperty('weak');
    expect(STRENGTH_CONFIG).toHaveProperty('fair');
    expect(STRENGTH_CONFIG).toHaveProperty('good');
    expect(STRENGTH_CONFIG).toHaveProperty('strong');
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  it('handles whitespace-only passwords', () => {
    const result = validatePassword('        ');
    expect(result.valid).toBe(false);
  });

  it('handles unicode characters in passwords', () => {
    const result = calculatePasswordStrength('Password123!é');
    expect(result.strength).toBe('strong');
  });

  it('handles very long passwords', () => {
    const longPassword = 'A'.repeat(1000) + '1!';
    const result = calculatePasswordStrength(longPassword);
    expect(result.score).toBe(5); // No lowercase
  });

  it('treats special characters correctly', () => {
    const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '='];
    for (const char of specialChars) {
      expect(checkRequirement(`password${char}`, 'special')).toBe(true);
    }
  });

  it('treats spaces as special characters', () => {
    expect(checkRequirement('pass word', 'special')).toBe(true);
  });
});
