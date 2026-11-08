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

describe('calculatePasswordStrength', () => {
  it.each([
    ['ab', 'weak', 2],
    ['abcdefg', 'weak', 1],
    ['Abcdefgh', 'fair', 3], // pragma: allowlist secret
    ['Abcdefg1', 'good', 4], // pragma: allowlist secret
    ['Abcdefghijk1', 'good', 5], // pragma: allowlist secret
    ['Abcdefghijk1!', 'strong', 6], // pragma: allowlist secret
  ])('scores %j as %s', (password, strength, maxScore) => {
    const result = calculatePasswordStrength(password);
    expect(result.strength).toBe(strength);
    expect(result.score).toBeLessThanOrEqual(maxScore);
    if (strength !== 'weak') expect(result.score).toBe(maxScore);
  });

  it('lists what is missing, and nothing for a strong password', () => {
    expect(calculatePasswordStrength('abc').feedback).toEqual([
      'At least 8 characters',
      'Uppercase letter',
      'Number',
      'Special character',
    ]);
    expect(calculatePasswordStrength('Abcdefghijk1!').feedback).toEqual([]); // pragma: allowlist secret
  });

  it('gives the 12-character bonus point without a feedback line', () => {
    const eleven = calculatePasswordStrength('Abcdefghij1'); // pragma: allowlist secret
    const twelve = calculatePasswordStrength('Abcdefghijk1'); // pragma: allowlist secret
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
    expect(validatePassword('abcdefg')).toBe('Password must be at least 8 characters');
    expect(validatePassword('abcdefgh')).toBeUndefined(); // pragma: allowlist secret
  });

  it('confirm password: required, and equal to the password', () => {
    expect(validateConfirmPassword('', 'abcdefgh')).toBe('Please confirm your password');
    expect(validateConfirmPassword('abcdefgi', 'abcdefgh')).toBe('Passwords do not match');
    expect(validateConfirmPassword('abcdefgh', 'abcdefgh')).toBeUndefined(); // pragma: allowlist secret
  });

  it('terms: must be accepted', () => {
    expect(validateAcceptTerms(false)).toBe('You must accept the terms and conditions');
    expect(validateAcceptTerms(true)).toBeUndefined();
  });
});
