// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OpenTicketsWidget } from '../OpenTicketsWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

const useQueryMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    ticket: {
      stats: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe('OpenTicketsWidget', () => {
  it('renders ticket metrics from the ticket stats query', async () => {
    useQueryMock.mockReturnValue({
      data: {
        total: 12,
        slaBreached: 2,
        bySLAStatus: {
          AT_RISK: 3,
          BREACHED: 2,
        },
      },
      isLoading: false,
    });

    render(<OpenTicketsWidget />);

    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/5 Urgent/)).toBeInTheDocument();
    expect(screen.getByText(/SLA breach/)).toHaveTextContent('2 SLA breaches');
  });

  it('polls ticket.stats on the shared dashboard refetch interval', () => {
    useQueryMock.mockReturnValue({ data: { total: 0, bySLAStatus: {} }, isLoading: false });
    render(<OpenTicketsWidget />);

    expect(useQueryMock).toHaveBeenCalledWith(
      { timeWindow: 'all' },
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });

  it('hides the urgent pill (no fake "0 Urgent") while stats are loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<OpenTicketsWidget />);

    expect(screen.queryByText(/Urgent/)).not.toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
