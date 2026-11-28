import { describe, it, expect } from 'vitest';
import {
  alignPeriods,
  performanceChanges,
  performanceKpis,
  winRateOf,
} from '../(list)/usePerformanceMetrics';

const figures = (over: Record<string, unknown> = {}) => ({
  pipelineValue: 10000,
  winRate: 30,
  avgDealSize: 2000,
  avgSalesCycleDays: 20 as number | null,
  totalRevenue: 6000,
  closedWonCount: 3,
  closedLostCount: 7,
  ...over,
});

describe('performanceKpis', () => {
  it('compares each KPI with the previous period; a shorter sales cycle is good', () => {
    const k = performanceKpis(figures(), figures({ totalRevenue: 4000, avgSalesCycleDays: 25 }));
    expect(k.revenue).toMatchObject({ percent: 50, tone: 'good' });
    expect(k.cycle).toMatchObject({ direction: 'down', tone: 'good' });
  });

  it('does not compare a win rate when a period closed no deals (codex 27/11)', () => {
    const none = figures({ winRate: 0, closedWonCount: 0, closedLostCount: 0 });
    expect(performanceKpis(none, figures({ winRate: 50 })).winRate).toBeNull();
    expect(performanceKpis(figures(), none).winRate).toBeNull();
    expect(winRateOf(none)).toBeNull();
    expect(winRateOf(figures())).toBe(30);
  });

  it('has no comparison where either period has no figure', () => {
    const k = performanceKpis(figures({ avgSalesCycleDays: null }), figures());
    expect(k.cycle).toBeNull();
    expect(performanceKpis(undefined, figures()).revenue).toBeNull();
  });
});

describe('alignPeriods', () => {
  it('lines the previous period up bucket by bucket, null where it has fewer buckets', () => {
    expect(
      alignPeriods(
        [
          { periodLabel: '1 Nov', value: 10 },
          { periodLabel: '2 Nov', value: 20 },
        ],
        [{ periodLabel: '2 Oct', value: 5 }]
      )
    ).toEqual([
      { label: '1 Nov', current: 10, previous: 5 },
      { label: '2 Nov', current: 20, previous: null },
    ]);
  });
});

describe('alignPeriods, previous period longer (codex 27/11)', () => {
  it('keeps every previous bucket, with no current value where this period has none', () => {
    expect(
      alignPeriods(
        [{ periodLabel: '1 Nov', value: 0 }],
        [
          { periodLabel: '2 Oct', value: 0 },
          { periodLabel: '3 Oct', value: 100 },
        ]
      )
    ).toEqual([
      { label: '1 Nov', current: 0, previous: 0 },
      { label: '3 Oct', current: null, previous: 100 },
    ]);
  });
});

describe('performanceChanges', () => {
  it('only reports KPIs both periods have', () => {
    const k = performanceKpis(
      figures({ avgSalesCycleDays: null, totalRevenue: 9000 }),
      figures({ totalRevenue: 4000 })
    );
    const changes = performanceChanges(k, (v) => `£${v}`);
    expect(changes.map((c) => c.label)).toEqual(['Booked revenue']);
  });
});

describe('pipeline created is not compared (codex 28/11: the older cohort lost its closed deals)', () => {
  it('never appears as a comparison or a change, however far it moved', () => {
    const k = performanceKpis(figures({ pipelineValue: 90000 }), figures({ pipelineValue: 1000 }));
    expect(k).not.toHaveProperty('pipeline');
    expect(performanceChanges(k, (v) => `£${v}`).map((c) => c.label)).not.toContain(
      'Pipeline created'
    );
  });
});

describe('a rise from £0 is a change (codex 28/11)', () => {
  it('reports booked revenue that rose from nothing', () => {
    const k = performanceKpis(figures({ totalRevenue: 50000 }), figures({ totalRevenue: 0 }));
    const changes = performanceChanges(k, (v) => `£${v}`);
    expect(changes[0]).toMatchObject({
      label: 'Booked revenue',
      summary: 'Booked revenue rose from £0 in the previous period',
      evidence: '£50000 now, £0 before',
      tone: 'good',
    });
  });
});
