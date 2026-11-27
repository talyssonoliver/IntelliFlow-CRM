import { describe, it, expect } from 'vitest';
import { normalizeROI, toFiniteNumber } from '../roi-utils';

describe('toFiniteNumber', () => {
  it('passes finite numbers and numeric strings', () => {
    expect(toFiniteNumber(5)).toBe(5);
    expect(toFiniteNumber(' 12.5 ')).toBe(12.5);
    expect(toFiniteNumber(new Number(7))).toBe(7);
  });

  it('reads Decimal-like objects through toString', () => {
    expect(toFiniteNumber({ toString: () => '19.5' })).toBe(19.5);
  });

  it('returns null for null, undefined, blank, boolean, NaN, Infinity and junk', () => {
    for (const v of [null, undefined, '', '  ', true, false, Number.NaN, Infinity, 'abc', {}, []]) {
      expect(toFiniteNumber(v)).toBeNull();
    }
  });
});

describe('normalizeROI', () => {
  it('returns null for non-records', () => {
    for (const v of [null, undefined, 5, 'x', [], { available: false }, { roi: {} }]) {
      expect(normalizeROI(v)).toBeNull();
    }
  });

  it('unwraps the API payload', () => {
    expect(
      normalizeROI({
        available: true,
        roi: { totalCost: '10', totalValue: 30, netValue: 20, roi: '200', trendDirection: 'up' },
      })
    ).toEqual({ totalCost: 10, totalValue: 30, netValue: 20, roi: 200, trendDirection: 'up' });
  });

  it('accepts a flat object and derives netValue and a default trend', () => {
    expect(normalizeROI({ totalCost: 10, totalValue: 25, roi: null })).toEqual({
      totalCost: 10,
      totalValue: 25,
      netValue: 15,
      roi: null,
      trendDirection: 'stable',
    });
  });

  it('reads a Decimal-valued flat roi instead of treating it as the wrapper', () => {
    const out = normalizeROI({
      totalCost: 4,
      totalValue: 8,
      netValue: 4,
      roi: { toString: () => '100' },
    });
    expect(out).toMatchObject({ totalCost: 4, totalValue: 8, netValue: 4, roi: 100 });
  });
});
