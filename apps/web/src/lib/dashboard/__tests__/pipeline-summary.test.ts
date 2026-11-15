import { describe, expect, it } from 'vitest';
import { LEAD_FUNNEL, hasOpenDeals, leadCountLabel, leadFunnelRows } from '../pipeline-summary';

describe('hasOpenDeals', () => {
  it('is true when any stage holds a deal', () => {
    expect(hasOpenDeals([{ count: 0 }, { count: 2 }])).toBe(true);
  });

  it('is false for all-empty stages, no stages, or no data', () => {
    expect(hasOpenDeals([{ count: 0 }, { count: 0 }])).toBe(false);
    expect(hasOpenDeals([])).toBe(false);
    expect(hasOpenDeals(undefined)).toBe(false);
  });
});

describe('leadFunnelRows', () => {
  it('returns every funnel step in order, counting missing statuses as 0', () => {
    const rows = leadFunnelRows({ NEW: 8, QUALIFIED: 2 });
    expect(rows.map((r) => r.status)).toEqual(LEAD_FUNNEL.map((s) => s.status));
    expect(rows.map((r) => r.count)).toEqual([8, 0, 2, 0, 0]);
  });

  it('sizes bars against the busiest step', () => {
    const rows = leadFunnelRows({ NEW: 8, CONTACTED: 4, QUALIFIED: 2 });
    expect(rows.slice(0, 3).map((r) => r.percent)).toEqual([100, 50, 25]);
  });

  it('gives empty bars when there are no leads', () => {
    expect(leadFunnelRows(undefined).every((r) => r.count === 0 && r.percent === 0)).toBe(true);
  });

  it('ignores statuses outside the funnel (lost, unqualified)', () => {
    const rows = leadFunnelRows({ LOST: 50, UNQUALIFIED: 10, NEW: 5 });
    expect(rows[0]).toMatchObject({ status: 'NEW', count: 5, percent: 100 });
  });
});

describe('leadCountLabel', () => {
  it('uses the singular for one lead', () => {
    expect(leadCountLabel(1)).toBe('1 lead');
    expect(leadCountLabel(0)).toBe('0 leads');
    expect(leadCountLabel(3)).toBe('3 leads');
  });
});
