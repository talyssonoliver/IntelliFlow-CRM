import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostTracker } from '../CostTracker';
import type { ROIData } from '@/lib/ai-monitoring/types';

const base = { totalCost: 10, totalValue: 30, netValue: 20, trendDirection: 'up' };

function renderRoi(roi: unknown) {
  return render(<CostTracker roi={roi as ROIData | null} isLoading={false} />);
}

describe('CostTracker roi robustness (register #54)', () => {
  it('renders a numeric roi with one decimal', () => {
    renderRoi({ ...base, roi: 200 });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('+200.0%');
  });

  it('renders a numeric-string roi without throwing', () => {
    renderRoi({ ...base, roi: '12.34' });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('+12.3%');
  });

  it('renders a dash and label for a null roi', () => {
    renderRoi({ ...base, roi: null });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('ROI unavailable');
  });

  it('renders a dash and label for a non-numeric roi', () => {
    renderRoi({ ...base, roi: 'abc' });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('ROI unavailable');
  });

  it('accepts the unflattened API wrapper payload', () => {
    renderRoi({ available: true, roi: { ...base, roi: 50 }, stats: {} });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('+50.0%');
    expect(screen.getByTestId('total-cost')).toHaveTextContent('$10.00');
  });

  it('shows a neutral (not red/green) unavailable state', () => {
    renderRoi({ ...base, roi: null });
    expect(screen.getByTestId('roi-value').className).toContain('text-muted-foreground');
  });

  it('renders negative and zero roi', () => {
    const { unmount } = renderRoi({ ...base, roi: -12.5 });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('-12.5%');
    unmount();
    renderRoi({ ...base, roi: 0 });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('+0.0%');
  });

  it('renders the empty state for an unavailable payload without ROI fields', () => {
    renderRoi({ available: false });
    expect(screen.getByTestId('no-cost-data')).toBeInTheDocument();
  });

  it('treats NaN and Infinity roi as unavailable', () => {
    const { unmount } = renderRoi({ ...base, roi: Number.NaN });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('ROI unavailable');
    unmount();
    renderRoi({ ...base, roi: Infinity });
    expect(screen.getByTestId('roi-value')).toHaveTextContent('ROI unavailable');
  });
});
