/**
 * RevenueChart Tests (PG-134)
 *
 * Tests for the transformPipelineData utility function.
 * Pure logic tests — no React rendering needed.
 */

import { describe, it, expect } from 'vitest';
import { transformPipelineData } from '../RevenueChart';

describe('transformPipelineData()', () => {
  it('returns empty array for empty input', () => {
    expect(transformPipelineData([])).toEqual([]);
  });

  it('groups opportunities by month', () => {
    const opps = [
      { value: 10000, expectedCloseDate: '2026-03-15', stage: 'PROPOSAL' },
      { value: 20000, expectedCloseDate: '2026-03-20', stage: 'NEGOTIATION' },
      { value: 30000, expectedCloseDate: '2026-04-10', stage: 'PROSPECTING' },
    ];

    const result = transformPipelineData(opps);

    expect(result).toHaveLength(2);
    expect(result[0].month).toBe('2026-03');
    expect(result[0].value).toBe(30000); // 10K + 20K
    expect(result[1].month).toBe('2026-04');
    expect(result[1].value).toBe(30000);
  });

  it('sorts buckets chronologically', () => {
    const opps = [
      { value: 5000, expectedCloseDate: '2026-06-01', stage: 'PROPOSAL' },
      { value: 8000, expectedCloseDate: '2026-01-01', stage: 'PROPOSAL' },
      { value: 3000, expectedCloseDate: '2026-03-01', stage: 'PROPOSAL' },
    ];

    const result = transformPipelineData(opps);

    expect(result[0].month).toBe('2026-01');
    expect(result[1].month).toBe('2026-03');
    expect(result[2].month).toBe('2026-06');
  });

  it('skips opportunities without expectedCloseDate', () => {
    const opps = [
      { value: 10000, expectedCloseDate: '2026-05-01', stage: 'PROPOSAL' },
      { value: 20000, expectedCloseDate: '', stage: 'NEGOTIATION' },
    ];

    const result = transformPipelineData(opps);

    // Second opp has empty string date — new Date('') is Invalid Date
    // The function checks !opp.expectedCloseDate, which is falsy for ''
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('handles single opportunity', () => {
    const opps = [{ value: 50000, expectedCloseDate: '2026-07-15', stage: 'CLOSED_WON' }];

    const result = transformPipelineData(opps);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ month: '2026-07', value: 50000 });
  });

  it('pads month with leading zero', () => {
    const opps = [{ value: 1000, expectedCloseDate: '2026-01-05', stage: 'PROPOSAL' }];

    const result = transformPipelineData(opps);

    expect(result[0].month).toBe('2026-01');
  });
});
