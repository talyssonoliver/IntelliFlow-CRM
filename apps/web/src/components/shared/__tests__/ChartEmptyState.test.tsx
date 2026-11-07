import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChartEmptyState } from '../ChartEmptyState';
import { EMPTY_CHART_MESSAGE } from '@/lib/charts/empty-series';

describe('ChartEmptyState', () => {
  it('shows the default message as a status', () => {
    render(<ChartEmptyState />);
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY_CHART_MESSAGE);
  });

  it('takes a message and a height class', () => {
    render(<ChartEmptyState message="No deals yet" className="h-48" />);
    const el = screen.getByTestId('chart-empty');
    expect(el).toHaveTextContent('No deals yet');
    expect(el).toHaveClass('h-48');
  });
});
