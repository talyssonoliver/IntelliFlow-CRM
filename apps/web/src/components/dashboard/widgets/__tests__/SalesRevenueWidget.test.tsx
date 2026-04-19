// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — SalesRevenueWidget reads analytics.getOverview
// (SalesRevenueWidget.tsx:7). revenueDelta >= 0 triggers the 'On track' pill.
vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: () => ({
          data: { totalRevenue: 45200, revenueDelta: 0 },
          isLoading: false,
        }),
      },
    },
  },
}));

import { SalesRevenueWidget } from '../SalesRevenueWidget';

describe('SalesRevenueWidget', () => {
  it('displays sales revenue metric', () => {
    render(<SalesRevenueWidget />);

    expect(screen.getByText('Sales Revenue')).toBeInTheDocument();
    // en-GB GBP (maximumFractionDigits: 0) → '£45,200'.
    expect(screen.getByText('£45,200')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });
});
