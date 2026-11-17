import { describe, expect, it } from 'vitest';
import { LEAD_FUNNEL, hasOpenDeals, leadCountLabel, leadFunnel } from '../pipeline-summary';

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

describe('leadFunnel', () => {
  it('returns every funnel step in order, counting missing statuses as 0', () => {
    const { rows } = leadFunnel({ total: 10, byStatus: { NEW: 8, QUALIFIED: 2 } });
    expect(rows.map((r) => r.status)).toEqual(LEAD_FUNNEL.map((s) => s.status));
    expect(rows.map((r) => r.count)).toEqual([8, 0, 2, 0, 0]);
  });

  it("adds up to the workspace's lead total: the owner's 121 leads", () => {
    // 1 new + 105 contacted + 15 that left the funnel (lost or unqualified) = 121.
    const { rows, other, total } = leadFunnel({
      total: 121,
      byStatus: { NEW: 1, CONTACTED: 105, LOST: 9, UNQUALIFIED: 6 },
    });
    expect(total).toBe(121);
    expect(other).toMatchObject({ label: 'Lost or unqualified', count: 15 });
    expect(rows.reduce((sum, r) => sum + r.count, 0) + (other?.count ?? 0)).toBe(121);
  });

  it('has no "other" line when every lead is in the funnel', () => {
    const { other, total } = leadFunnel({ total: 3, byStatus: { NEW: 2, CONTACTED: 1 } });
    expect(other).toBeNull();
    expect(total).toBe(3);
  });

  it('falls back to the sum of every status when there is no total', () => {
    const { other, total } = leadFunnel({ byStatus: { NEW: 4, LOST: 2 } });
    expect(total).toBe(6);
    expect(other?.count).toBe(2);
  });

  it('never reports fewer leads than the funnel holds', () => {
    // A stale or partial total must not make "other" negative.
    const { other, total } = leadFunnel({ total: 1, byStatus: { NEW: 4 } });
    expect(total).toBe(4);
    expect(other).toBeNull();
  });

  it('sizes bars against the busiest row, "other" included', () => {
    const { rows, other } = leadFunnel({
      total: 24,
      byStatus: { NEW: 8, CONTACTED: 4, QUALIFIED: 2 },
    });
    expect(other?.count).toBe(10);
    expect(other?.percent).toBe(100);
    expect(rows.slice(0, 3).map((r) => r.percent)).toEqual([80, 40, 20]);
  });

  it('gives empty bars and no rows of data when there are no leads', () => {
    const { rows, other, total } = leadFunnel(undefined);
    expect(total).toBe(0);
    expect(other).toBeNull();
    expect(rows.every((r) => r.count === 0 && r.percent === 0)).toBe(true);
  });
});

describe('leadCountLabel', () => {
  it('uses the singular for one lead', () => {
    expect(leadCountLabel(1)).toBe('1 lead');
    expect(leadCountLabel(0)).toBe('0 leads');
    expect(leadCountLabel(3)).toBe('3 leads');
  });
});
