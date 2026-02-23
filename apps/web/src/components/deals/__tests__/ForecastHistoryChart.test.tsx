/**
 * @vitest-environment jsdom
 * ForecastHistoryChart Tests (PG-131)
 * Tests the inner recharts component that ForecastHistory dynamically imports.
 */
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import type { HistoryPoint } from '../forecast/types';

// ─── Mock recharts ──────────────────────────────────────────────────────────

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-count={data.length}>{children}</div>
  ),
  Line: ({ type, dataKey }: { type: string; dataKey: string }) => (
    <div data-testid="line" data-type={type} data-key={dataKey} />
  ),
  XAxis: ({ label }: { label?: { value: string } }) => (
    <div data-testid="x-axis" data-label={label?.value} />
  ),
  YAxis: ({ label }: { label?: { value: string } }) => (
    <div data-testid="y-axis" data-label={label?.value} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: { content?: React.FC<{ active?: boolean; payload?: Array<{ payload: unknown }> }> }) => {
    // Render the custom tooltip content if provided
    const Content = content;
    return (
      <div data-testid="tooltip">
        {Content && (
          <>
            <div data-testid="tooltip-active">
              <Content active={true} payload={[{ payload: { date: '2026-01-15', probability: 55, event: 'Stage change' } }]} />
            </div>
            <div data-testid="tooltip-inactive">
              <Content active={false} payload={[]} />
            </div>
            <div data-testid="tooltip-projected">
              <Content active={true} payload={[{ payload: { date: '2026-02-01', probability: 65, isProjected: true } }]} />
            </div>
          </>
        )}
      </div>
    );
  },
  ReferenceLine: ({ y }: { y: number }) => <div data-testid="reference-line" data-y={y} />,
}));

// Import after mocks
import ForecastHistoryChart from '../forecast/ForecastHistoryChart';

const sampleData: HistoryPoint[] = [
  { date: '2026-01-01', probability: 40 },
  { date: '2026-01-15', probability: 55, event: 'Stage change' },
  { date: '2026-02-01', probability: 65, isProjected: true },
];

describe('ForecastHistoryChart', () => {
  it('renders chart container with data-testid', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('history-chart')).toBeInTheDocument();
  });

  it('passes data to LineChart', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-count', '3');
  });

  it('renders deal mode with "Probability (%)" Y-axis label', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-label', 'Probability (%)');
  });

  it('renders portfolio mode with "Win Rate (%)" Y-axis label', () => {
    render(<ForecastHistoryChart data={sampleData} mode="portfolio" />);
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-label', 'Win Rate (%)');
  });

  it('renders ReferenceLine at y=50 in deal mode', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('reference-line')).toHaveAttribute('data-y', '50');
  });

  it('does NOT render ReferenceLine in portfolio mode', () => {
    render(<ForecastHistoryChart data={sampleData} mode="portfolio" />);
    expect(screen.queryByTestId('reference-line')).not.toBeInTheDocument();
  });

  it('uses stepAfter line type in deal mode', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('line')).toHaveAttribute('data-type', 'stepAfter');
  });

  it('uses monotone line type in portfolio mode', () => {
    render(<ForecastHistoryChart data={sampleData} mode="portfolio" />);
    expect(screen.getByTestId('line')).toHaveAttribute('data-type', 'monotone');
  });

  it('X-axis labeled "Date"', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-label', 'Date');
  });

  it('tooltip renders event text for active state', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByText('Stage change')).toBeInTheDocument();
  });

  it('tooltip renders "Projected" for projected points', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    expect(screen.getByText('Projected')).toBeInTheDocument();
  });

  it('tooltip returns null when inactive', () => {
    render(<ForecastHistoryChart data={sampleData} mode="deal" />);
    // The inactive tooltip container should be empty (null returned)
    const inactive = screen.getByTestId('tooltip-inactive');
    expect(inactive.childElementCount).toBe(0);
  });
});
