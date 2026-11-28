import { describe, it, expect } from 'vitest';
import { currencySymbol, formatMoney, formatMoneyCompact } from '../money';
import { formatGBPCompact } from '../gbp-compact';

describe('formatMoneyCompact', () => {
  it('defaults to pounds', () => {
    expect(formatMoneyCompact(500)).toBe('£500');
    expect(formatMoneyCompact(50_000)).toBe('£50k');
    expect(formatMoneyCompact(1_250_000)).toBe('£1.3M');
  });

  it.each([
    ['GBP', '£'],
    ['USD', '$'],
    ['EUR', '€'],
    ['JPY', '¥'],
  ])('uses the %s symbol', (code, sym) => {
    expect(formatMoneyCompact(500, code)).toBe(`${sym}500`);
    expect(formatMoneyCompact(50_000, code)).toBe(`${sym}50k`);
    expect(formatMoneyCompact(1_250_000, code)).toBe(`${sym}1.3M`);
  });

  it('rounds before choosing the unit', () => {
    expect(formatMoneyCompact(999.5, 'USD')).toBe('$1k');
    expect(formatMoneyCompact(999.4, 'USD')).toBe('$999');
    expect(formatMoneyCompact(999_600, 'EUR')).toBe('€1.0M');
  });

  it('keeps fraction digits', () => {
    expect(formatMoneyCompact(1_250, 'USD', 1)).toBe('$1.3k');
  });

  it('falls back to the code for an unknown or invalid code', () => {
    expect(formatMoneyCompact(500, 'ZZZ')).toBe('ZZZ500');
    expect(currencySymbol('not-a-code')).toBe('not-a-code ');
    expect(formatMoneyCompact(50_000, 'not-a-code')).toBe('not-a-code 50k');
  });
});

describe('formatMoney', () => {
  it('formats full amounts in the currency', () => {
    expect(formatMoney(125_000)).toBe('£125,000');
    expect(formatMoney(125_000, 'USD')).toContain('125,000');
    expect(formatMoney(125_000, 'USD')).toBe('$125,000');
    expect(formatMoney(125_000, 'EUR')).toBe('€125,000');
    expect(formatMoney(125_000, 'JPY')).toContain('125,000');
  });

  it('supports fraction digits and unknown codes', () => {
    expect(formatMoney(1234.5, 'GBP', { fractionDigits: 2 })).toBe('£1,234.50');
    expect(formatMoney(1234, 'bad-code')).toBe('bad-code 1,234');
  });
});

describe('formatGBPCompact wrapper', () => {
  it('stays pounds', () => {
    expect(formatGBPCompact(1_250_000)).toBe('£1.3M');
  });
});
