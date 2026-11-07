// @vitest-environment jsdom
/**
 * #1225: a failed request is not a zero. Each widget says it couldn't load
 * instead of showing 0, "..." forever, or an empty chart.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const failed = { data: undefined, isLoading: false, isError: true, error: new Error('x') };
const overviewMock = vi.fn();
const leadStatsMock = vi.fn();
const leadMetricsMock = vi.fn();
const pipelineMock = vi.fn();
const ticketStatsMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: { useQuery: () => overviewMock() },
      getLeadMetrics: { useQuery: () => leadMetricsMock() },
    },
    lead: { stats: { useQuery: () => leadStatsMock() } },
    opportunity: { getPipeline: { useQuery: () => pipelineMock() } },
  },
}));

vi.mock('@/lib/api', () => ({
  api: { ticket: { stats: { useQuery: () => ticketStatsMock() } } },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

import { ActiveDealsWidget } from '../ActiveDealsWidget';
import { ActiveLeadsWidget } from '../ActiveLeadsWidget';
import { ConversionRateWidget } from '../ConversionRateWidget';
import { OpenTicketsWidget } from '../OpenTicketsWidget';
import { PipelineSummaryWidget } from '../PipelineSummaryWidget';
import { SalesRevenueWidget } from '../SalesRevenueWidget';
import { TotalLeadsWidget } from '../TotalLeadsWidget';

function expectCouldntLoad() {
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load");
  expect(screen.queryByText('...')).not.toBeInTheDocument();
}

describe('dashboard widgets when the request fails', () => {
  beforeEach(() => {
    overviewMock.mockReturnValue(failed);
    leadStatsMock.mockReturnValue(failed);
    leadMetricsMock.mockReturnValue(failed);
    ticketStatsMock.mockReturnValue(failed);
  });

  it('Active Deals', () => {
    render(<ActiveDealsWidget />);
    expectCouldntLoad();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('Active Leads', () => {
    render(<ActiveLeadsWidget />);
    expectCouldntLoad();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('Active Leads hides the comparison when only the overview fails', () => {
    leadStatsMock.mockReturnValue({ data: { total: 40 }, isLoading: false, isError: false });
    render(<ActiveLeadsWidget />);
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.queryByText(/last month/)).not.toBeInTheDocument();
  });

  it('Conversion Rate', () => {
    render(<ConversionRateWidget />);
    expectCouldntLoad();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('Open Tickets', () => {
    render(<OpenTicketsWidget />);
    expectCouldntLoad();
    expect(screen.queryByText(/Urgent/)).not.toBeInTheDocument();
  });

  it('Sales Revenue', () => {
    render(<SalesRevenueWidget />);
    expectCouldntLoad();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });

  it('Total Leads', () => {
    render(<TotalLeadsWidget />);
    expectCouldntLoad();
  });

  it('Total Leads shows no trend badge when only the overview fails', () => {
    leadStatsMock.mockReturnValue({ data: { total: 40 }, isLoading: false, error: null });
    render(<TotalLeadsWidget />);
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('Pipeline Summary offers a retry', () => {
    const refetch = vi.fn();
    pipelineMock.mockReturnValue({ ...failed, refetch });
    render(<PipelineSummaryWidget />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the pipeline.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
