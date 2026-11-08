/**
 * The registration form's password strength and field validators, imported from the form.
 * Replaces registration-form.b11.test.ts, which asserted copies of these functions; its email
 * regex had drifted from the form's (#1216). Render-level behaviour is in
 * registration-form.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import {
  calculatePasswordStrength,
  validateAcceptTerms,
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePassword,
} from '../registration-form';

/**
 * A password-shaped fixture built at runtime from what it must contain, so no literal that a
 * secret scanner reads as a password sits in source.
 */
function sample(spec: { length: number; upper?: boolean; digit?: boolean; symbol?: boolean }) {
  const parts = [spec.upper ? 'X' : '', spec.digit ? '7' : '', spec.symbol ? '#' : ''].join('');
  return parts + 'q'.repeat(Math.max(0, spec.length - parts.length));
}

describe('calculatePasswordStrength', () => {
  it.each([
    [{ length: 2 }, 'weak', 1],
    [{ length: 7 }, 'weak', 1],
    [{ length: 8, upper: true }, 'fair', 3],
    [{ length: 8, upper: true, digit: true }, 'good', 4],
    [{ length: 12, upper: true, digit: true }, 'good', 5],
    [{ length: 12, upper: true, digit: true, symbol: true }, 'strong', 6],
  ])('scores %j as %s', (spec, strength, score) => {
    const result = calculatePasswordStrength(sample(spec));
    expect(result.strength).toBe(strength);
    expect(result.score).toBe(score);
  });

  it('lists what is missing, and nothing for a strong password', () => {
    expect(calculatePasswordStrength(sample({ length: 3 })).feedback).toEqual([
      'At least 8 characters',
      'Uppercase letter',
      'Number',
      'Special character',
    ]);
    const strong = sample({ length: 12, upper: true, digit: true, symbol: true });
    expect(calculatePasswordStrength(strong).feedback).toEqual([]);
  });

  it('gives the 12-character bonus point without a feedback line', () => {
    const eleven = calculatePasswordStrength(sample({ length: 11, upper: true, digit: true }));
    const twelve = calculatePasswordStrength(sample({ length: 12, upper: true, digit: true }));
    expect(twelve.score).toBe(eleven.score + 1);
    expect(twelve.feedback).toEqual(eleven.feedback);
  });
});

describe('field validators', () => {
  it('full name: at least two non-space characters', () => {
    expect(validateFullName('')).toMatch(/required/);
    expect(validateFullName('A')).toMatch(/required/);
    expect(validateFullName('  ')).toMatch(/required/);
    expect(validateFullName(' A ')).toMatch(/required/);
    expect(validateFullName('Jo')).toBeUndefined();
  });

  it('email: required, and a single-domain address shape', () => {
    expect(validateEmail('')).toBe('Email is required');
    expect(validateEmail(true)).toBe('Email is required');
    expect(validateEmail('not-email')).toBe('Please enter a valid email address');
    expect(validateEmail('a b@example.com')).toBe('Please enter a valid email address');
    expect(validateEmail('a@@example.com')).toBe('Please enter a valid email address');
    expect(validateEmail('user@example.com')).toBeUndefined();
  });

  it('password: required, at least 8 characters', () => {
    expect(validatePassword('')).toBe('Password is required');
    expect(validatePassword(false)).toBe('Password is required');
    expect(validatePassword(sample({ length: 7 }))).toBe('Password must be at least 8 characters');
    expect(validatePassword(sample({ length: 8 }))).toBeUndefined();
  });

  it('confirm password: required, and equal to the password', () => {
    const chosen = sample({ length: 8 });
    const other = sample({ length: 9 });
    expect(validateConfirmPassword('', chosen)).toBe('Please confirm your password');
    expect(validateConfirmPassword(other, chosen)).toBe('Passwords do not match');
    expect(validateConfirmPassword(chosen, chosen)).toBeUndefined();
  });

  it('terms: must be accepted', () => {
    expect(validateAcceptTerms(false)).toBe('You must accept the terms and conditions');
    expect(validateAcceptTerms(true)).toBeUndefined();
  });
});
