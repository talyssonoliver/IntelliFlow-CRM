import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ChartEmptyState, ChartUnavailable } from '../ChartEmptyState';
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

describe('ChartUnavailable', () => {
  it('shows the failure as an alert and retries on click', () => {
    const onRetry = vi.fn();
    render(<ChartUnavailable message="Couldn't load x." onRetry={onRetry} className="h-48" />);
    const el = screen.getByTestId('chart-error');
    expect(el).toHaveAttribute('role', 'alert');
    expect(el).toHaveTextContent("Couldn't load x.");
    expect(el).toHaveClass('h-48');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('takes a test id', () => {
    render(<ChartUnavailable message="m" onRetry={() => {}} testId="deals-won-error" />);
    expect(screen.getByTestId('deals-won-error')).toBeInTheDocument();
  });
});
