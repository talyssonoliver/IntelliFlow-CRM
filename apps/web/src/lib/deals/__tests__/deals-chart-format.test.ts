import { describe, expect, it } from 'vitest';
import { formatGBP } from '@/lib/dashboard/kpi-calculator';
import { formatGBPCompact } from '@/lib/format/gbp-compact';
import { revenueAxisTick, revenueTooltip } from '../deals-chart-format';

describe('deals chart formatters', () => {
  it('labels the axis in compact pounds, coercing recharts values', () => {
    expect(revenueAxisTick(4500)).toBe(formatGBPCompact(4500));
    expect(revenueAxisTick('12000')).toBe(formatGBPCompact(12000));
    expect(revenueAxisTick(4500)).toMatch(/^£/);
  });

  it('shows the full pound amount in the tooltip', () => {
    expect(revenueTooltip(4500)).toEqual([formatGBP(4500), 'Revenue']);
    expect(revenueTooltip(4500)[0]).toMatch(/^£/);
  });

  it('reads a non-number tooltip value as £0', () => {
    expect(revenueTooltip(undefined)).toEqual([formatGBP(0), 'Revenue']);
  });
});
