import { describe, it, expect } from 'vitest';

import { EMPTY_CHART_MESSAGE, isEmptySeries } from '../empty-series';

describe('isEmptySeries (#1225 UI-013)', () => {
  it('is true for no rows', () => {
    expect(isEmptySeries(null)).toBe(true);
    expect(isEmptySeries(undefined)).toBe(true);
    expect(isEmptySeries([])).toBe(true);
  });

  it('checks plain numbers', () => {
    expect(isEmptySeries([0, 0, null, Number.NaN])).toBe(true);
    expect(isEmptySeries([0, 3])).toBe(false);
  });

  it('checks the given keys of object rows', () => {
    const rows = [
      { month: 'Jan', value: 0, target: 10 },
      { month: 'Feb', value: 0, target: 10 },
    ];
    expect(isEmptySeries(rows, 'value')).toBe(true);
    expect(isEmptySeries(rows, ['value', 'target'])).toBe(false);
  });

  it('checks every numeric field when no key is given, ignoring labels', () => {
    expect(
      isEmptySeries([
        { month: 'Jan', a: 0, b: '0' },
        { month: 'Feb', a: null },
      ])
    ).toBe(true);
    expect(isEmptySeries([{ month: 'Jan', a: 0, b: '2.5' }])).toBe(false);
    expect(isEmptySeries([{ label: 'only text' }])).toBe(true);
  });

  it('has a default message', () => {
    expect(EMPTY_CHART_MESSAGE).toMatch(/No data/);
  });
});
