import { describe, it, expect } from 'vitest';
import { AnalyticsAggregationService } from '../AnalyticsAggregationService';
import type { AnalyticsRepository } from '../../ports/repositories/AnalyticsRepositoryPort';

type Bucket = { label: string; range: { startDate: Date; endDate: Date } };
const bucketsOf = (start: string, end: string, granularity: 'day' | 'week' | 'month'): Bucket[] =>
  (
    new AnalyticsAggregationService({} as AnalyticsRepository) as unknown as {
      getDateBuckets(r: { startDate: Date; endDate: Date }, g: string): Bucket[];
    }
  ).getDateBuckets({ startDate: new Date(start), endDate: new Date(end) }, granularity);

describe('getDateBuckets covers the whole range (codex 28/11: wins before 15:00 were dropped)', () => {
  for (const granularity of ['day', 'week', 'month'] as const) {
    it(`${granularity} buckets are contiguous from a mid-day start to the end`, () => {
      const buckets = bucketsOf(
        '2026-09-01T15:00:00.000Z',
        '2026-11-28T15:00:00.000Z',
        granularity
      );
      expect(buckets[0].range.startDate.toISOString()).toBe('2026-09-01T15:00:00.000Z');
      expect(buckets.at(-1)!.range.endDate.toISOString()).toBe('2026-11-28T15:00:00.000Z');
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i].range.startDate.getTime()).toBe(
          buckets[i - 1].range.endDate.getTime() + 1
        );
      }
    });
  }

  it('starts every later day bucket at midnight UTC', () => {
    const buckets = bucketsOf('2026-11-21T15:00:00.000Z', '2026-11-28T15:00:00.000Z', 'day');
    expect(buckets).toHaveLength(8);
    expect(buckets[1].range.startDate.toISOString()).toBe('2026-11-22T00:00:00.000Z');
    expect(buckets.at(-1)!.range.startDate.toISOString()).toBe('2026-11-28T00:00:00.000Z');
  });
});
