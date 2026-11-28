import { describe, it, expect } from 'vitest';
import { formatGBPCompact } from '../gbp-compact';
import { formatCurrencyCompact } from '@/components/deals/types';
import { formatGBPCompact as fromLeads } from '@/lib/leads/lead-format';

describe('formatGBPCompact', () => {
  it('shows pounds, never dollars', () => {
    expect(formatGBPCompact(0)).toBe('£0');
    expect(formatGBPCompact(500)).toBe('£500');
    expect(formatGBPCompact(50_000)).toBe('£50k');
    expect(formatGBPCompact(1_250_000)).toBe('£1.3M');
  });

  it('rounds before choosing the unit', () => {
    expect(formatGBPCompact(999.5)).toBe('£1k');
    expect(formatGBPCompact(999.4)).toBe('£999');
    expect(formatGBPCompact(999_600)).toBe('£1.0M');
  });

  it('keeps fraction digits for the analytics labels', () => {
    expect(formatGBPCompact(1_500, 1)).toBe('£1.5k');
  });

  it('keeps the leads re-export and the deals default in pounds', () => {
    expect(fromLeads).toBe(formatGBPCompact);
    expect(formatCurrencyCompact(125_000)).toBe('£125k');
  });
});
