/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const seen = vi.hoisted(() => ({
  pie: undefined as Record<string, unknown> | undefined,
  legend: undefined as Record<string, unknown> | undefined,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: (props: any) => {
    seen.pie = props;
    return <div data-testid="pie">{props.children}</div>;
  },
  Cell: () => null,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: (props: any) => {
    seen.legend = props;
    return null;
  },
}));
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

import DealsCharts from '../DealsCharts';

const stages = [
  { name: 'Prospecting', value: 0, color: '#1' },
  { name: 'Qualification', value: 1, color: '#2' },
  { name: 'Needs Analysis', value: 0, color: '#3' },
  { name: 'Proposal', value: 0, color: '#4' },
  { name: 'Negotiation', value: 0, color: '#5' },
];

describe('DealsCharts donut (MVP-012 #33)', () => {
  it('draws only the stages that have deals and puts no labels on the ring, so none can overlap', () => {
    render(<DealsCharts pieChartData={stages} barChartData={[]} />);
    expect((seen.pie!.data as { name: string }[]).map((s) => s.name)).toEqual(['Qualification']);
    expect(seen.pie).not.toHaveProperty('label');
  });

  it('says how many deals in each stage in the legend', () => {
    render(
      <DealsCharts
        pieChartData={[
          { name: 'Qualification', value: 3, color: '#2' },
          { name: 'Proposal', value: 1, color: '#4' },
        ]}
        barChartData={[]}
      />
    );
    const formatter = seen.legend!.formatter as (name: string) => string;
    expect(formatter('Qualification')).toBe('Qualification: 3');
    expect(formatter('Proposal')).toBe('Proposal: 1');
  });

  it('still lists every stage, zeros included, in the data table for screen readers', () => {
    render(<DealsCharts pieChartData={stages} barChartData={[]} />);
    const table = screen.getByRole('table', { name: 'Deals by Stage data' });
    expect(table).toHaveTextContent('Prospecting');
    expect(table).toHaveTextContent('Negotiation');
  });

  it('draws no donut at all when no stage has a deal', () => {
    render(
      <DealsCharts pieChartData={stages.map((s) => ({ ...s, value: 0 }))} barChartData={[]} />
    );
    expect(screen.queryByTestId('pie')).toBeNull();
  });
});
