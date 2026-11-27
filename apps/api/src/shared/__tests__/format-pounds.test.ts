import { describe, it, expect } from 'vitest';
import { formatPounds } from '../format-pounds';

describe('formatPounds', () => {
  it('puts a pound sign and thousands separators on a whole amount', () => {
    expect(formatPounds(12500)).toBe('£12,500');
    expect(formatPounds(0)).toBe('£0');
  });

  it('never uses a dollar sign', () => {
    expect(formatPounds(2500)).not.toContain('$');
  });

  it('reads a value that is not a number as £0', () => {
    expect(formatPounds(Number.NaN)).toBe('£0');
  });
});
