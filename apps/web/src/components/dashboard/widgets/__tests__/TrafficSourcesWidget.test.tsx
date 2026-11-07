// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { TrafficSourcesWidget } from '../TrafficSourcesWidget';

const useQueryMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      trafficSources: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe('TrafficSourcesWidget', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('renders loading state', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<TrafficSourcesWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders traffic source list', () => {
    useQueryMock.mockReturnValue({
      data: [
        { name: 'Organic', percentage: 55, color: 'bg-green-500' },
        { name: 'Paid', percentage: 25, color: 'bg-blue-500' },
      ],
      isLoading: false,
    });

    render(<TrafficSourcesWidget />);

    expect(screen.getByText('Traffic Sources')).toBeInTheDocument();
    expect(screen.getByText('Organic')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('keeps its title and shows a message in the plot area when there is no data (#1225 UI-013)', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    render(<TrafficSourcesWidget />);

    expect(screen.getByText(/Traffic Sources/)).toBeInTheDocument();
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('says the request failed and retries instead of showing an empty period', () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<TrafficSourcesWidget />);

    expect(screen.queryByTestId('chart-empty')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load traffic sources.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
