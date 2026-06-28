// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const useQueryMock = vi.fn((..._args: unknown[]) => ({
  data: {
    stages: [
      {
        stageKey: 'QUALIFICATION',
        displayName: 'Qualification',
        count: 5,
        totalValue: 10000,
      },
      { stageKey: 'PROPOSAL', displayName: 'Proposal', count: 3, totalValue: 20000 },
      { stageKey: 'NEGOTIATION', displayName: 'Negotiation', count: 2, totalValue: 15000 },
      { stageKey: 'CLOSED_WON', displayName: 'Closed Won', count: 1, totalValue: 5000 },
    ],
    totalPipelineValue: 50000,
  },
  isLoading: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: {
      getPipeline: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

import { PipelineSummaryWidget } from '../PipelineSummaryWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

describe('PipelineSummaryWidget', () => {
  it('renders pipeline summary stages', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });

  it('formats stage values as GBP via the calculator', () => {
    render(<PipelineSummaryWidget />);

    // formatGBP(10000) → '£10,000'; the row reads '£10,000 (5 Deals)'.
    expect(screen.getByText(/£10,000 \(5 Deals\)/)).toBeInTheDocument();
    expect(screen.getByText(/£20,000 \(3 Deals\)/)).toBeInTheDocument();
  });

  it('polls opportunity.getPipeline on the shared dashboard refetch interval', () => {
    render(<PipelineSummaryWidget />);

    expect(useQueryMock).toHaveBeenCalledWith(
      { includeClosedStages: false },
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });
});
