// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      getOverview: {
        useQuery: () => ({ data: { openOpportunities: 18 }, isLoading: false }),
      },
    },
  },
}));

import { ActiveDealsWidget } from '../ActiveDealsWidget';

describe('ActiveDealsWidget', () => {
  it('renders active deals stat', () => {
    render(<ActiveDealsWidget />);
    expect(screen.getByText('Active Deals')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });
});
