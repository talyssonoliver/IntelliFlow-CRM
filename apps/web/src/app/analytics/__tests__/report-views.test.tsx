/**
 * Sales Reports and Pipeline Analysis (owner 22/11: "This page sales reports and pipeline analysis
 * is no ops yet, why?"). Both nav links used to reopen the Overview; they are real pages now.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createAnalyticsSidebarConfig } from '@/components/sidebar';

const sales = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
const leads = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ analytics: { exportReport: { fetch: vi.fn() } } }),
    analytics: {
      getSalesMetrics: { useQuery: () => sales },
      getLeadMetrics: { useQuery: () => leads },
      getTimeSeriesData: { useQuery: () => ({ data: [], isLoading: false }) },
    },
  },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/lib/format/useTenantCurrency', () => ({ useTenantCurrency: () => 'GBP' }));
vi.mock('@/components/dashboard/widgets/PipelineSummaryWidget', () => ({
  PipelineSummaryWidget: () => <div data-testid="dashboard-pipeline-summary" />,
}));
vi.mock('@/lib/export/csv', () => ({ downloadCSV: vi.fn() }));

const { default: SalesReportsPage } = await import('../(list)/sales/page');
const { default: PipelineAnalysisPage } = await import('../(list)/pipeline/page');

describe('Analytics report views', () => {
  beforeEach(() => {
    sales.data = undefined;
    sales.isLoading = false;
    sales.isError = false;
    leads.data = undefined;
    leads.isLoading = false;
    leads.isError = false;
  });

  it('points the nav at real pages, not a query string the Overview ignores', () => {
    const config = createAnalyticsSidebarConfig(() => {});
    const hrefs = config.sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/analytics/sales');
    expect(hrefs).toContain('/analytics/pipeline');
    expect(hrefs).toContain('/deals/forecast');
    expect(hrefs.some((h) => h?.includes('?view='))).toBe(false);
  });

  it('Sales Reports shows the period’s won and lost figures', () => {
    sales.data = {
      pipelineValue: 0,
      winRate: 75,
      avgDealSize: 2000,
      avgSalesCycleDays: 12.4,
      totalRevenue: 6000,
      closedWonCount: 3,
      closedLostCount: 1,
    };
    render(<SalesReportsPage />);
    expect(screen.getByRole('heading', { name: 'Sales Reports' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('12 days')).toBeInTheDocument();
    expect(screen.getByText('of 4 closed deals')).toBeInTheDocument();
  });

  it('Sales Reports says when nothing was won instead of showing 0 days', () => {
    sales.data = {
      pipelineValue: 0,
      winRate: 0,
      avgDealSize: 0,
      avgSalesCycleDays: null,
      totalRevenue: 0,
      closedWonCount: 0,
      closedLostCount: 0,
    };
    render(<SalesReportsPage />);
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('no deals won in this period')).toBeInTheDocument();
    expect(screen.getByText('No deals closed in this period.')).toBeInTheDocument();
  });

  it('Pipeline Analysis uses the Dashboard pipeline and breaks leads down', () => {
    leads.data = {
      total: 10,
      conversionRate: 20,
      bySource: [{ source: 'WEBSITE', name: 'Website', count: 6, percentage: 60 }],
      byStatus: [{ status: 'NEEDS_ANALYSIS', count: 4, percentage: 40 }],
    };
    render(<PipelineAnalysisPage />);
    expect(screen.getByTestId('dashboard-pipeline-summary')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('Needs analysis')).toBeInTheDocument();
  });

  // Codex review 26/11: a failed request is not an empty period.
  it('Sales Reports says when its data could not load, with a retry', () => {
    sales.isError = true;
    render(<SalesReportsPage />);
    expect(screen.getByText("Couldn't load won and lost deals.")).toBeInTheDocument();
    expect(screen.queryByText('No deals closed in this period.')).toBeNull();
  });

  it('Pipeline Analysis says when its breakdown could not load, with a retry', () => {
    leads.isError = true;
    render(<PipelineAnalysisPage />);
    expect(screen.getAllByText("Couldn't load the lead breakdown.")).toHaveLength(2);
    expect(screen.queryByText('No leads in this period.')).toBeNull();
  });

  it('Pipeline Analysis says when the period has no leads', () => {
    leads.data = { total: 0, conversionRate: 0, bySource: [], byStatus: [] };
    render(<PipelineAnalysisPage />);
    expect(screen.getAllByText('No leads in this period.')).toHaveLength(2);
  });
});
