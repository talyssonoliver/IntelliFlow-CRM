// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const useQueryMock = vi.fn<
  (...args: unknown[]) => { data?: { openOpportunities: number }; isLoading: boolean }
>(() => ({
  data: { openOpportunities: 18 },
  isLoading: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

import { ActiveDealsWidget } from '../ActiveDealsWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

describe('ActiveDealsWidget', () => {
  it('renders active deals stat', () => {
    render(<ActiveDealsWidget />);
    expect(screen.getByText('Active Deals')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('shows a pending indicator (not a fake 0) when the query has no data yet', () => {
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: false });
    render(<ActiveDealsWidget />);
    expect(screen.getByText('...')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('polls analytics.getOverview on the shared dashboard refetch interval', () => {
    render(<ActiveDealsWidget />);

    expect(useQueryMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });
});
