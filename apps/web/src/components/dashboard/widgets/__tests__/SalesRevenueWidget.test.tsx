// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — SalesRevenueWidget reads analytics.getOverview
// (SalesRevenueWidget.tsx:7). revenueDelta >= 0 triggers the 'On track' pill.
const useQueryMock = vi.fn<
  (...args: unknown[]) => {
    data?: { totalRevenue: number; revenueDelta: number };
    isLoading: boolean;
  }
>(() => ({
  data: { totalRevenue: 45200, revenueDelta: 0 },
  isLoading: false,
}));

// The tenant currency (Analytics -> Report settings); undefined while it loads.
const currencyMock = vi.fn<() => string | undefined>(() => undefined);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
      reportSettings: {
        currency: {
          useQuery: () => ({ data: currencyMock() ? { currency: currencyMock() } : undefined }),
        },
      },
    },
  },
}));

import { SalesRevenueWidget } from '../SalesRevenueWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

describe('SalesRevenueWidget tenant currency', () => {
  it('shows dollars when the tenant currency is USD', () => {
    currencyMock.mockReturnValue('USD');
    render(<SalesRevenueWidget />);

    expect(screen.getByText('$45,200')).toBeInTheDocument();
    expect(screen.queryByText('£45,200')).not.toBeInTheDocument();
    currencyMock.mockReturnValue(undefined);
  });

  it('shows euros when the tenant currency is EUR', () => {
    currencyMock.mockReturnValue('EUR');
    render(<SalesRevenueWidget />);

    expect(screen.getByText('€45,200')).toBeInTheDocument();
    currencyMock.mockReturnValue(undefined);
  });

  it('stays in pounds while the setting loads', () => {
    render(<SalesRevenueWidget />);

    expect(screen.getByText('£45,200')).toBeInTheDocument();
  });
});

describe('SalesRevenueWidget', () => {
  it('displays sales revenue metric', () => {
    render(<SalesRevenueWidget />);

    expect(screen.getByText('Sales Revenue')).toBeInTheDocument();
    // en-GB GBP (maximumFractionDigits: 0) → '£45,200'.
    expect(screen.getByText('£45,200')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('polls analytics.getOverview on the shared dashboard refetch interval', () => {
    render(<SalesRevenueWidget />);

    expect(useQueryMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });

  it('shows the skeleton (not a fake £0) when the query has no data yet', () => {
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: false });
    const { container } = render(<SalesRevenueWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });
});

describe('SalesRevenueWidget at zero (#1249 visual check)', () => {
  it('shows £0 with no "On track" or "Behind" verdict', () => {
    useQueryMock.mockReturnValueOnce({
      data: { totalRevenue: 0, revenueDelta: 0 },
      isLoading: false,
    });
    render(<SalesRevenueWidget />);

    expect(screen.getByText('£0')).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText('Behind')).not.toBeInTheDocument();
  });
});
