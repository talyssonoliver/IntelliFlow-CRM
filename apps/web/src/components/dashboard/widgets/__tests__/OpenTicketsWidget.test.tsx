// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OpenTicketsWidget } from '../OpenTicketsWidget';

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
});
