/**
 * #1225 UI-013: charts given all-zero data show a message in the plot area
 * instead of an empty box.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));

import { RevenueTrendChart } from '@/app/analytics/(list)/RevenueTrendChart';
import DealsCharts from '@/components/deals/DealsCharts';
import ForecastHistoryChart from '@/components/deals/forecast/ForecastHistoryChart';
import ForecastRevenueChart from '@/components/deals/ForecastRevenueChart';

const fmt = (v: number) => `£${v}`;

describe('charts with an empty series', () => {
  it('RevenueTrendChart', () => {
    render(
      <RevenueTrendChart
        timeSeries={[
          { periodLabel: 'Oct', value: 0 },
          { periodLabel: 'Nov', value: 0 },
        ]}
        formatCurrency={fmt}
      />
    );
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('DealsCharts shows one message per empty chart', () => {
    render(
      <DealsCharts
        pieChartData={[{ name: 'Proposal', value: 0, color: '#000' }]}
        barChartData={[{ name: 'Proposal', revenue: 0, color: '#000' }]}
      />
    );
    expect(screen.getAllByTestId('chart-empty')).toHaveLength(2);
  });

  it('ForecastHistoryChart', () => {
    render(<ForecastHistoryChart data={[]} mode={'portfolio' as never} />);
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('ForecastRevenueChart keeps its title and legend', () => {
    render(
      <ForecastRevenueChart
        data={[{ month: 'Dec', actual: 0, projected: 0 }] as never}
        formatCurrency={fmt}
        formatFullCurrency={fmt}
      />
    );
    expect(screen.getByText('Revenue Projection')).toBeInTheDocument();
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });
});
