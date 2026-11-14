// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isValidEmailAddress } from '../email-address';

describe('isValidEmailAddress', () => {
  it.each([
    'user@example.com',
    'name@company.co.uk',
    'name@mail.example.com',
    'student@uni.ac.uk',
    'first.last+tag@sub.domain.example.org',
    'a@b.c',
  ])('accepts %s', (address) => {
    expect(isValidEmailAddress(address)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['not-an-email', 'no @'],
    ['@example.com', 'nothing before the @'],
    ['user@', 'no domain'],
    ['user@localhost', 'a single-label domain'],
    ['a@@example.com', 'a double @'],
    ['a@b@example.com', 'two @'],
    ['a b@example.com', 'a space before the @'],
    ['ab@exam ple.com', 'a space in the domain'],
    [' user@example.com', 'a leading space'],
    ['user@example.com\t', 'a trailing tab'],
    ['user@.example.com', 'an empty first label'],
    ['user@example..com', 'an empty middle label'],
    ['user@example.com.', 'a trailing dot'],
  ])('rejects %j (%s)', (address) => {
    expect(isValidEmailAddress(address)).toBe(false);
  });

  it('rejects values that are not strings', () => {
    expect(isValidEmailAddress(null)).toBe(false);
    expect(isValidEmailAddress(undefined)).toBe(false);
  });
});
