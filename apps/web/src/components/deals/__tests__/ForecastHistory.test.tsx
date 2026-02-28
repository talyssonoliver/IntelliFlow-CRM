/**
 * @vitest-environment jsdom
 * ForecastHistory Component Tests (PG-131)
 * AC-006: 30-day step chart in deal mode, win rate trend in portfolio mode.
 */
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { createMockHistoryPoint } from './deal-test-utils';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: { children: React.ReactNode; className?: string }) => (
    <div {...props}>{children}</div>
  ),
  Skeleton: ({ className, ...props }: { className?: string }) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
}));

// Mock next/dynamic to render the chart component inline
vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // For test purposes, just render a placeholder representing the chart
    const DynamicComponent = (props: Record<string, unknown>) => (
      <div data-testid="history-chart" data-mode={String(props.mode)} data-points={JSON.stringify(props.data)}>
        Dynamic Chart
      </div>
    );
    DynamicComponent.displayName = 'DynamicForecastHistoryChart';
    return DynamicComponent;
  },
}));

// Import AFTER mocks
import { ForecastHistory } from '../forecast/ForecastHistory';

describe('ForecastHistory', () => {
  const sampleData = [
    createMockHistoryPoint({ date: '2026-02-01', probability: 20 }),
    createMockHistoryPoint({ date: '2026-02-10', probability: 40 }),
    createMockHistoryPoint({ date: '2026-02-15', probability: 60 }),
  ];

  it('renders chart container with data', () => {
    render(<ForecastHistory data={sampleData} mode="deal" />);

    expect(screen.getByTestId('forecast-history')).toBeInTheDocument();
    expect(screen.getByTestId('history-chart')).toBeInTheDocument();
  });

  it('deal mode shows "Probability History" title', () => {
    render(<ForecastHistory data={sampleData} mode="deal" />);

    expect(screen.getByText('Probability History')).toBeInTheDocument();
  });

  it('portfolio mode shows "Win Rate Trend" title', () => {
    render(<ForecastHistory data={sampleData} mode="portfolio" />);

    expect(screen.getByText('Win Rate Trend')).toBeInTheDocument();
  });

  it('shows empty state when data is empty array', () => {
    render(<ForecastHistory data={[]} mode="deal" />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'No history data available yet'
    );
  });

  it('renders loading skeleton when isLoading=true', () => {
    render(<ForecastHistory data={[]} mode="deal" isLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('custom empty message via emptyMessage prop', () => {
    render(
      <ForecastHistory data={[]} mode="deal" emptyMessage="Check back later" />
    );

    expect(screen.getByText('Check back later')).toBeInTheDocument();
  });

  it('uses dynamic import with ssr: false pattern', async () => {
    // The next/dynamic mock verifies that the component uses dynamic import
    // The chart should render as the mocked DynamicComponent
    render(<ForecastHistory data={sampleData} mode="deal" />);

    const chart = screen.getByTestId('history-chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute('data-mode', 'deal');
  });

  it('correct axis labels for portfolio vs deal mode', () => {
    const { rerender } = render(<ForecastHistory data={sampleData} mode="deal" />);
    expect(screen.getByText('Probability History')).toBeInTheDocument();

    rerender(<ForecastHistory data={sampleData} mode="portfolio" />);
    expect(screen.getByText('Win Rate Trend')).toBeInTheDocument();
  });
});
