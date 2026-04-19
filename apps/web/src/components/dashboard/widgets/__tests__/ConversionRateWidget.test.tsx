// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — ConversionRateWidget reads analytics.getLeadMetrics
// (ConversionRateWidget.tsx:15).
vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getLeadMetrics: {
        useQuery: () => ({ data: { conversionRate: 3.2 }, isLoading: false }),
      },
    },
  },
}));

import { ConversionRateWidget } from '../ConversionRateWidget';

describe('ConversionRateWidget', () => {
  it('renders conversion rate and progress bar', () => {
    const { container } = render(<ConversionRateWidget />);

    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('3.2%')).toBeInTheDocument();
    // Component uses bg-warning class (design system color). Progress width
    // is `min(conversionRate * 10, 100)` — 3.2 * 10 = 32%.
    const progress = container.querySelector('.bg-warning') as HTMLElement;
    expect(progress.style.width).toBe('32%');
  });
});
