// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { GrowthTrendsWidget } from '../GrowthTrendsWidget';

const useQueryMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      growthTrends: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe('GrowthTrendsWidget', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('shows loading skeleton while fetching', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<GrowthTrendsWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders growth trend data with YoY badge', () => {
    useQueryMock.mockReturnValue({
      data: [
        { month: 'Jan', value: 20, yoyChange: -5 },
        { month: 'Feb', value: 40, yoyChange: 8 },
      ],
      isLoading: false,
    });

    render(<GrowthTrendsWidget />);

    expect(screen.getByText('Growth Trends')).toBeInTheDocument();
    expect(screen.getByText('+8% YoY')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('keeps its title and shows a message in the plot area when there is no data (#1225 UI-013)', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    render(<GrowthTrendsWidget />);

    expect(screen.getByText(/Growth Trends/)).toBeInTheDocument();
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });
});
