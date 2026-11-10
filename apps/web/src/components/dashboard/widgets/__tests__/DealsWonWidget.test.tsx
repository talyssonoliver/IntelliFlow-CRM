// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DealsWonWidget } from '../DealsWonWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

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

    expect(screen.getByText('Deals Won')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });

  it('re-queries with 12 months when the range select changes (#1225 UI-014)', () => {
    useQueryMock.mockReturnValue({ data: [{ month: 'Jan', value: 2 }], isLoading: false });
    render(<DealsWonWidget />);

    fireEvent.change(screen.getByLabelText('Select deals-won time range'), {
      target: { value: '12' },
    });

    expect(useQueryMock).toHaveBeenLastCalledWith({ months: 12 }, expect.anything());
    expect(screen.getByLabelText('Select deals-won time range')).toHaveValue('12');
  });

  it('shows a message in the plot area when every month is zero (#1225 UI-013)', () => {
    useQueryMock.mockReturnValue({
      data: [
        { month: 'Jan', value: 0 },
        { month: 'Feb', value: 0 },
      ],
      isLoading: false,
    });
    render(<DealsWonWidget />);

    expect(screen.getByText('Deals Won')).toBeInTheDocument();
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('No deals won in this period yet');
    expect(screen.queryByText('Jan')).toBeNull();
  });

  it('says the data is unavailable, not zero, when the request fails, and retries', () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<DealsWonWidget />);

    expect(screen.getByTestId('deals-won-error')).toHaveTextContent("Couldn't load deals won.");
    expect(screen.queryByTestId('chart-empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('polls the slow trend at 5x the shared dashboard interval', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    render(<DealsWonWidget />);

    expect(useQueryMock).toHaveBeenCalledWith(
      { months: 6 },
      expect.objectContaining({ refetchInterval: 5 * DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });
});

describe('DealsWonWidget after a failed background refresh', () => {
  it('keeps the chart it already loaded', () => {
    useQueryMock.mockReturnValue({
      data: [
        { month: 'Jan', value: 4 },
        { month: 'Feb', value: 10 },
      ],
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(<DealsWonWidget />);

    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DealsWonWidget before any answer', () => {
  it('shows the skeleton, not "no deals won", while the query has not run', () => {
    // A disabled React Query v5 query: no data, not loading, no error.
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    const { container } = render(<DealsWonWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText(/No deals won/i)).not.toBeInTheDocument();
  });
});
