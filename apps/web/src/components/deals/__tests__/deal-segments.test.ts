import { describe, it, expect } from 'vitest';
import { dealSegmentFilter, parseDealSegment } from '../deal-segments';

const NOW = new Date('2026-11-27T15:30:00.000Z');

describe('Deals sidebar segments (owner 26/11: they did nothing)', () => {
  it('reads only the known segments from the URL', () => {
    expect(parseDealSegment('hot')).toBe('hot');
    expect(parseDealSegment('stalled')).toBe('stalled');
    expect(parseDealSegment('at-risk')).toBeNull();
    expect(parseDealSegment(null)).toBeNull();
  });

  it('hot: open deals above 70%', () => {
    const f = dealSegmentFilter('hot', NOW);
    expect(f.minProbability).toBe(71);
    expect(f.stage).not.toContain('CLOSED_WON');
    expect(f.stage).not.toContain('CLOSED_LOST');
  });

  it('stalled: open deals not updated in 30 days, cut at the start of the UTC day', () => {
    const f = dealSegmentFilter('stalled', NOW);
    expect(f.updatedBefore?.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(f.stage).not.toContain('CLOSED_WON');
    // Same day, later: the same cutoff, so the list query does not change every render.
    expect(
      dealSegmentFilter('stalled', new Date('2026-11-27T23:59:00.000Z')).updatedBefore
    ).toEqual(f.updatedBefore);
  });
});
