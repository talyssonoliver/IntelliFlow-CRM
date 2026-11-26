import { describe, it, expect } from 'vitest';
import {
  compare,
  materialChanges,
  previousRange,
  trendGranularity,
  type MetricForChanges,
} from '../period-comparison';

describe('previousRange', () => {
  it('is the same length immediately before the range', () => {
    const prev = previousRange({
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-12-01T00:00:00.000Z',
    });
    expect(prev.endDate).toBe('2026-11-01T00:00:00.000Z');
    expect(new Date(prev.startDate).getTime()).toBe(
      new Date('2026-11-01T00:00:00.000Z').getTime() -
        (new Date('2026-12-01T00:00:00.000Z').getTime() -
          new Date('2026-11-01T00:00:00.000Z').getTime())
    );
  });
});

describe('trendGranularity', () => {
  it('shows days for short periods and weeks for long ones (never months for 30 days)', () => {
    expect(trendGranularity('7d')).toBe('day');
    expect(trendGranularity('30d')).toBe('day');
    expect(trendGranularity('90d')).toBe('week');
    expect(trendGranularity('ytd')).toBe('week');
  });
});

describe('compare', () => {
  it('marks a rise as good when higher is better', () => {
    expect(compare(120, 100)).toMatchObject({
      delta: 20,
      percent: 20,
      direction: 'up',
      tone: 'good',
    });
  });

  it('marks a rise as bad when lower is better (e.g. sales cycle)', () => {
    expect(compare(40, 30, 'lower')).toMatchObject({ direction: 'up', tone: 'bad' });
  });

  it('has no percentage when the previous period was 0', () => {
    expect(compare(5, 0)).toMatchObject({ percent: null, direction: 'up', tone: 'good' });
  });

  it('is flat and neutral when nothing moved', () => {
    expect(compare(3, 3)).toMatchObject({ direction: 'flat', tone: 'neutral', delta: 0 });
  });
});

describe('materialChanges', () => {
  const money = (v: number) => `£${v}`;
  const pct = (v: number) => `${v}%`;
  const metrics: MetricForChanges[] = [
    { label: 'Revenue', comparison: compare(1500, 1000), unit: '%', format: money },
    { label: 'Win rate', comparison: compare(30, 42), unit: 'pp', format: pct },
    { label: 'Average deal', comparison: compare(1030, 1000), unit: '%', format: money },
  ];

  it('lists only material movements, largest first, with both figures as evidence', () => {
    const changes = materialChanges(metrics);
    expect(changes.map((c) => c.label)).toEqual(['Revenue', 'Win rate']);
    expect(changes[0]).toMatchObject({
      summary: 'Revenue rose 50% against the previous period',
      evidence: '£1500 now, £1000 before',
      tone: 'good',
    });
    expect(changes[1]).toMatchObject({
      summary: 'Win rate fell 12 pp against the previous period',
      tone: 'bad',
    });
  });

  it('says nothing when no metric moved materially', () => {
    expect(materialChanges([metrics[2]])).toEqual([]);
  });
});
