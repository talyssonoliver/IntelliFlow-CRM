import { describe, it, expect } from 'vitest';
import { previousPeriod } from '../AnalyticsAggregationService';

describe('previousPeriod (codex 27/11: "vs previous period" compared with last month)', () => {
  it('is the same length and ends just before the range starts', () => {
    const range = {
      startDate: new Date('2026-10-28T00:00:00.000Z'),
      endDate: new Date('2026-11-27T23:59:59.999Z'),
    };
    const prev = previousPeriod(range);
    expect(prev.endDate.toISOString()).toBe('2026-10-27T23:59:59.999Z');
    expect(prev.endDate.getTime() - prev.startDate.getTime()).toBe(
      range.endDate.getTime() - range.startDate.getTime()
    );
    expect(prev.startDate.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });
});
