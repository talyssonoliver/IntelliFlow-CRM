/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rememberSignupEmail, takeSignupEmail } from '../signup-prefill';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('signup prefill', () => {
  it('hands the email over once, trimmed', () => {
    rememberSignupEmail('  maya@northwind.example ');
    expect(takeSignupEmail()).toBe('maya@northwind.example');
    expect(takeSignupEmail()).toBe('');
  });

  it('starts empty when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberSignupEmail('a@b.example')).not.toThrow();
    expect(takeSignupEmail()).toBe('');
  });
});
