// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

  it('returns null when no sources', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<TrafficSourcesWidget />);

    expect(container).toBeEmptyDOMElement();
  });
});
