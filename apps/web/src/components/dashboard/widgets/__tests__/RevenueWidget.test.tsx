// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — RevenueWidget reads analytics.getOverview for the total and
// analytics.getTimeSeriesData for the bar chart (RevenueWidget.tsx:21-27).
vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: () => ({
          data: { totalRevenue: 124500, revenueDelta: 0 },
          isLoading: false,
        }),
      },
      getTimeSeriesData: {
        useQuery: () => ({
          data: [
            { date: '2026-04-09', value: 10000 },
            { date: '2026-04-10', value: 15000 },
            { date: '2026-04-11', value: 20000 },
          ],
          isLoading: false,
        }),
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
});
