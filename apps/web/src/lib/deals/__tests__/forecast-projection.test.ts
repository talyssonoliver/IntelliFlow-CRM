import { describe, it, expect } from 'vitest';
import { buildRevenueProjection, monthLabel } from '../forecast-projection';

const now = new Date(Date.UTC(2026, 10, 23)); // 23 Nov 2026
const label = (y: number, m: number) => monthLabel(new Date(Date.UTC(y, m, 1)));

describe('buildRevenueProjection (owner 23/11: no made-up figures)', () => {
  it('shows six months of actuals then two months ahead, in order', () => {
    const rows = buildRevenueProjection([], [], now);
    expect(rows.map((r) => r.month)).toEqual([
      label(2026, 5),
      label(2026, 6),
      label(2026, 7),
      label(2026, 8),
      label(2026, 9),
      label(2026, 10),
      label(2026, 11),
      label(2027, 0),
    ]);
  });

  it('projects nothing at all when there are no open deals (no invented growth)', () => {
    const rows = buildRevenueProjection([{ month: label(2026, 9), actual: 5000 }], [], now);
    expect(rows.every((r) => r.projected === null)).toBe(true);
    expect(rows.find((r) => r.month === label(2026, 9))?.actual).toBe(5000);
  });

  it('counts each open deal at value × probability in the month it should close', () => {
    const rows = buildRevenueProjection(
      [],
      [
        { value: 10000, probability: 50, expectedCloseDate: '2026-12-10' },
        { value: 2000, probability: 100, expectedCloseDate: '2027-01-31' },
        { value: 9999, probability: 90, expectedCloseDate: '2027-06-01' }, // too far ahead
        { value: 4000, probability: 25, expectedCloseDate: '' }, // no date
      ],
      now
    );
    expect(rows.find((r) => r.month === label(2026, 11))?.projected).toBe(5000);
    expect(rows.find((r) => r.month === label(2027, 0))?.projected).toBe(2000);
    expect(rows.find((r) => r.month === label(2026, 10))?.projected).toBeNull();
  });

  it('puts an open deal whose close date has passed into this month', () => {
    const rows = buildRevenueProjection(
      [],
      [{ value: 1000, probability: 40, expectedCloseDate: '2026-09-01' }],
      now
    );
    expect(rows.find((r) => r.month === label(2026, 10))?.projected).toBe(400);
  });
});
