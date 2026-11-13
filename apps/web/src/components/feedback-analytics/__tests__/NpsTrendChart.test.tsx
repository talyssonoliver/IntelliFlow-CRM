// @vitest-environment jsdom
/**
 * #1225 UI-013: a trend with no scores shows the empty state, not blank axes.
 * The check looks at the plotted scores only; `responseCount` is always a number
 * and must not make an all-null series look like data.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div data-testid="chart">{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    Line: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    CartesianGrid: Nothing,
    Tooltip: Nothing,
    Legend: Nothing,
  };
});

import NpsTrendChart from '../NpsTrendChart';

const point = (scores: { nps: number | null; csat: number | null; ces: number | null }) => ({
  period: 'Nov',
  responseCount: 0,
  ...scores,
});

describe('NpsTrendChart', () => {
  it('shows the empty state when every score is null, whatever responseCount says', () => {
    render(
      <NpsTrendChart trends={[point({ nps: null, csat: null, ces: null })]} granularity="month" />
    );
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('shows the empty state for no rows', () => {
    render(<NpsTrendChart trends={[]} granularity="month" />);
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('draws the chart when any score is present, including a real zero', () => {
    render(
      <NpsTrendChart trends={[point({ nps: 0, csat: null, ces: null })]} granularity="month" />
    );
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0);
  });
});
