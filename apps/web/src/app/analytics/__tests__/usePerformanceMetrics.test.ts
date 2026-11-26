import { describe, it, expect } from 'vitest';
import { alignPeriods, performanceChanges, performanceKpis } from '../(list)/usePerformanceMetrics';

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
