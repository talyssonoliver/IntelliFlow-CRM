/**
 * @vitest-environment jsdom
 * ValueSummary Component Tests (PG-135)
 * AC-7: Stats cards show accurate totals
 * AC-24: Stats cards have aria-label with full context
 */
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ValueSummary } from '../ValueSummary';
import { createMockPipelineStats } from './deal-test-utils';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="card" className={className} {...props}>
      {children}
    </div>
  ),
}));

describe('ValueSummary', () => {
  it('renders 4 stat cards', () => {
    const stats = createMockPipelineStats();
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('Active Deals')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
    expect(screen.getByText('Weighted Value')).toBeInTheDocument();
    expect(screen.getByText('Won This Period')).toBeInTheDocument();
  });

  it('displays totalDeals as integer', () => {
    const stats = createMockPipelineStats({ totalDeals: 42 });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats totalValue with compact currency', () => {
    const stats = createMockPipelineStats({ totalValue: 1250000 });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('$1.3M')).toBeInTheDocument();
  });

  it('formats values in thousands as $XK', () => {
    const stats = createMockPipelineStats({ totalValue: 125000 });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('$125K')).toBeInTheDocument();
  });

  it('formats wonValue correctly', () => {
    const stats = createMockPipelineStats({ wonValue: 50000 });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('$50K')).toBeInTheDocument();
  });

  it('handles zero values for all stats', () => {
    const stats = createMockPipelineStats({
      totalDeals: 0,
      totalValue: 0,
      weightedValue: 0,
      wonValue: 0,
    });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    // $0 appears for zero values
    const zeroValues = screen.getAllByText('$0');
    expect(zeroValues.length).toBe(3); // totalValue, weightedValue, wonValue
  });

  it('each card has aria-label with descriptive text (AC-24)', () => {
    const stats = createMockPipelineStats({ totalDeals: 12, totalValue: 450000 });
    render(<ValueSummary stats={stats} />);

    expect(screen.getByLabelText('Active deals: 12')).toBeInTheDocument();
    expect(screen.getByLabelText('Pipeline value: $450K')).toBeInTheDocument();
  });

  it('renders responsive grid with correct classes', () => {
    const stats = createMockPipelineStats();
    const { container } = render(<ValueSummary stats={stats} />);

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
  });
});
