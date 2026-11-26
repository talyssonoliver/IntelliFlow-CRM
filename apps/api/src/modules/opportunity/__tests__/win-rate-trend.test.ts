import { describe, it, expect } from 'vitest';
import { buildWinRateTrend } from '../opportunity.router';

// Owner 23/11 on Deal Forecast: the trend must be real history, not May-Oct with the average
// painted into every empty month.
describe('buildWinRateTrend', () => {
  const now = new Date(Date.UTC(2026, 10, 23)); // 23 Nov 2026

  it('covers the last six calendar months, ending with this month', () => {
    const months = buildWinRateTrend([], now).map((m) => m.month);
    expect(months).toEqual(['Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov'].map(shortMonthLabel));
  });

  it('leaves a month with no closed deals empty instead of borrowing the overall rate', () => {
    const trend = buildWinRateTrend(
      [
        { closedAt: new Date(Date.UTC(2026, 10, 2)), stage: 'CLOSED_WON' },
        { closedAt: new Date(Date.UTC(2026, 10, 9)), stage: 'CLOSED_LOST' },
        { closedAt: new Date(Date.UTC(2026, 10, 12)), stage: 'CLOSED_WON' },
        { closedAt: new Date(Date.UTC(2026, 10, 20)), stage: 'CLOSED_WON' },
      ],
      now
    );
    expect(trend.at(-1)).toEqual({ month: shortMonthLabel('Nov'), rate: 75, closed: 4 });
    expect(trend.slice(0, 5).every((m) => m.rate === null && m.closed === 0)).toBe(true);
  });

  it('keeps the same month of an earlier year out of this month', () => {
    const trend = buildWinRateTrend(
      [{ closedAt: new Date(Date.UTC(2025, 10, 5)), stage: 'CLOSED_WON' }],
      now
    );
    expect(trend.at(-1)?.closed).toBe(0);
  });
});

/** The runtime's en-GB short month name (ICU prints "Sept" or "Sep" depending on version). */
function shortMonthLabel(name: string): string {
  const index = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sept',
    'Oct',
    'Nov',
    'Dec',
  ]
    .map((n) => n.slice(0, 3))
    .indexOf(name.slice(0, 3));
  return new Date(Date.UTC(2026, index, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
}
