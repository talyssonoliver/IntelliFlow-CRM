/**
 * Analytics: Performance (owner 26/11, Analytics redesign). How the business performed in the
 * period against the previous one; none of the Dashboard's operational widgets (comment #10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

type Query = { data: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
const q = (data: unknown): Query => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

// Each analytics procedure answers per call: the first call is this period, the second the one
// before (the page asks in that order).
const state = vi.hoisted(() => ({
  sales: [] as Query[],
  leads: [] as Query[],
  trend: { data: [], isLoading: false, isError: false, refetch: () => {} } as Query,
  // When set, the revenue trend answers per call too: this period, then the one before.
  trends: null as Query[] | null,
}));

vi.mock('@/lib/trpc', () => {
  let salesCall = 0;
  let leadsCall = 0;
  let trendCall = 0;
  return {
    trpc: {
      useUtils: () => ({ analytics: { exportReport: { fetch: vi.fn() } } }),
      analytics: {
        getSalesMetrics: { useQuery: () => state.sales[salesCall++ % 2] },
        getLeadMetrics: { useQuery: () => state.leads[leadsCall++ % 2] },
        getTimeSeriesData: {
          useQuery: () => (state.trends ? state.trends[trendCall++ % 2] : state.trend),
        },
      },
    },
  };
});
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/lib/format/useTenantCurrency', () => ({ useTenantCurrency: () => 'GBP' }));
vi.mock('@/lib/export/csv', () => ({ downloadCSV: vi.fn() }));

const { default: AnalyticsPerformancePage } = await import('../(list)/page');

const salesNow = {
  pipelineValue: 0,
  winRate: 30,
  avgDealSize: 2000,
  avgSalesCycleDays: 20,
  totalRevenue: 6000,
  closedWonCount: 3,
  closedLostCount: 7,
};
const salesBefore = { ...salesNow, winRate: 42, totalRevenue: 4000, avgSalesCycleDays: 20 };
const leadsNow = { total: 40, conversionRate: 5, bySource: [], byStatus: [] };
const leadsBefore = { total: 40, conversionRate: 5, bySource: [], byStatus: [] };

describe('Analytics Performance view', () => {
  beforeEach(() => {
    state.sales = [q(salesNow), q(salesBefore)];
    state.leads = [q(leadsNow), q(leadsBefore)];
    state.trends = null;
  });

  it('compares each figure with the previous period', () => {
    render(<AnalyticsPerformancePage />);
    expect(screen.getByText('+50%')).toBeInTheDocument(); // revenue 6000 vs 4000
    expect(screen.getByText('−12 pp')).toBeInTheDocument(); // win rate 30 vs 42
  });

  it('lists what changed materially, with both figures as evidence', () => {
    render(<AnalyticsPerformancePage />);
    const changes = screen.getByText('What changed').closest('div')!.parentElement!;
    expect(within(changes).getByText('£6k now, £4k before')).toBeInTheDocument();
    expect(
      within(changes).getByText('Booked revenue rose 50% against the previous period')
    ).toBeInTheDocument();
    expect(
      within(changes).getByText('Win rate fell 12 pp against the previous period')
    ).toBeInTheDocument();
  });

  it('does not show the Dashboard widgets (owner comment #10)', () => {
    render(<AnalyticsPerformancePage />);
    expect(screen.queryByText('Pipeline Summary')).toBeNull();
    expect(screen.queryByText('Recent Activity')).toBeNull();
  });

  it('says "No data" for the sales cycle when nothing was won, never 0 days', () => {
    state.sales = [q({ ...salesNow, avgSalesCycleDays: null }), q(salesBefore)];
    render(<AnalyticsPerformancePage />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('no deals won in this period')).toBeInTheDocument();
  });

  it('says the comparison failed instead of showing zeros when a request fails', () => {
    state.sales = [{ ...q(undefined), isError: true }, q(salesBefore)];
    render(<AnalyticsPerformancePage />);
    expect(screen.getByText("Couldn't compare the periods.")).toBeInTheDocument();
    expect(screen.queryByText('+50%')).toBeNull();
  });

  it('reports the revenue chart as unavailable when the previous period fails, and retries both (codex 27/11)', () => {
    const now = q([]);
    const before = { ...q(undefined), isError: true };
    state.trends = [now, before];
    render(<AnalyticsPerformancePage />);
    expect(screen.getByText("Couldn't load booked revenue.")).toBeInTheDocument();
    screen.getByRole('button', { name: /retry|try again/i }).click();
    expect(now.refetch).toHaveBeenCalled();
    expect(before.refetch).toHaveBeenCalled();
  });

  it('picks the period in the hero, with the compared dates under the title (owner 22/11)', () => {
    render(<AnalyticsPerformancePage />);
    expect(screen.getByRole('button', { name: /Period/ })).toBeInTheDocument();
    expect(screen.getByText(/vs the previous \d+ days/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
