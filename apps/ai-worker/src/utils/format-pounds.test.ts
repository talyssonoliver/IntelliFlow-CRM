import { describe, it, expect } from 'vitest';
import { formatPounds } from './format-pounds';

describe('formatPounds', () => {
  it('puts a pound sign and en-GB separators on an amount', () => {
    expect(formatPounds(12500)).toBe('£12,500');
    expect(formatPounds(1234567)).toBe('£1,234,567');
  });

  it('never uses a dollar sign', () => {
    expect(formatPounds(50000)).not.toContain('$');
  });

  it('reads a value that is not a number as £0', () => {
    expect(formatPounds(Number.NaN)).toBe('£0');
  });
});
