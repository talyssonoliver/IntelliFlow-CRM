// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DealsWonWidget } from '../DealsWonWidget';

const useQueryMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      dealsWonTrend: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe('DealsWonWidget', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('shows loading skeleton', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<DealsWonWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders bar chart data', () => {
    useQueryMock.mockReturnValue({
      data: [
        { month: 'Jan', value: 4 },
        { month: 'Feb', value: 10 },
      ],
      isLoading: false,
    });

    render(<DealsWonWidget />);

    expect(screen.getByText('Deals Won (Last 6 Months)')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });
});
