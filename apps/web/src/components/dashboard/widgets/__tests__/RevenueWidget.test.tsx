// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — RevenueWidget reads analytics.getOverview for the total and
// analytics.getTimeSeriesData for the bar chart (RevenueWidget.tsx:21-27).
const overviewQueryMock = vi.fn<
  () => {
    data?: { totalRevenue: number; revenueDelta: number };
    isLoading: boolean;
    isError?: boolean;
  }
>(() => ({
  data: { totalRevenue: 124500, revenueDelta: 0 },
  isLoading: false,
}));

const timeSeriesQueryMock = vi.fn<
  () => {
    data?: Array<{ date: string; value: number }>;
    isLoading: boolean;
    isError?: boolean;
    refetch?: () => void;
  }
>(() => ({
  data: [
    { date: '2026-04-09', value: 10000 },
    { date: '2026-04-10', value: 15000 },
    { date: '2026-04-11', value: 20000 },
  ],
  isLoading: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: () => overviewQueryMock(),
      },
      getTimeSeriesData: {
        useQuery: () => timeSeriesQueryMock(),
      },
    },
  },
}));

import { RevenueWidget } from '../RevenueWidget';

describe('RevenueWidget', () => {
  it('renders revenue summary with en-GB GBP formatting', () => {
    render(<RevenueWidget config={{ timeRange: 'week' }} />);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    // en-GB GBP with maximumFractionDigits: 0 → £124,500 (was $124,500 pre-migration).
    expect(screen.getByText('£124,500')).toBeInTheDocument();
    // Week mode shows day labels (Mon/Tue/.../Sun) — verify first label renders.
    // The old 'This Week' pill text was removed when the widget was
    // refactored to show day-of-week labels under the bar chart.
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  it('shows a pending indicator (not a fake £0) when overview has no data', () => {
    overviewQueryMock.mockReturnValueOnce({ data: undefined, isLoading: false });
    render(<RevenueWidget config={{ timeRange: 'week' }} />);

    expect(screen.getByText('...')).toBeInTheDocument();
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
  });

  it('says the chart request failed and retries instead of showing an empty period', () => {
    const refetch = vi.fn();
    timeSeriesQueryMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<RevenueWidget config={{ timeRange: 'week' }} />);

    expect(screen.queryByTestId('chart-empty')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load revenue.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('says the total is unavailable when the overview request fails', () => {
    overviewQueryMock.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true });
    render(<RevenueWidget config={{ timeRange: 'week' }} />);

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });
});
