import { describe, expect, it } from 'vitest';
import { hasHeaderInjection, normalizeEmail } from '../email-address';

describe('email address helpers', () => {
  it('normalizes by trimming and lower-casing', () => {
    expect(normalizeEmail('  Someone@Example.INVALID ')).toBe('someone@example.invalid');
  });

  it.each(['a\rb', 'a\nb', 'a\0b', 'line\r\nBcc: x@y.example'])(
    'flags %j as header injection',
    (v) => {
      expect(hasHeaderInjection(v)).toBe(true);
    }
  );

  it('accepts ordinary values', () => {
    expect(hasHeaderInjection('Quarterly report – Q3')).toBe(false);
    expect(hasHeaderInjection('')).toBe(false);
  });
});
