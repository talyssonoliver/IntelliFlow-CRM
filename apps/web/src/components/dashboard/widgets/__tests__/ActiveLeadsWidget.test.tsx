// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock tRPC — ActiveLeadsWidget consumes lead.stats.useQuery for the total
// and analytics.getOverview.useQuery for the delta (ActiveLeadsWidget.tsx:7-8).
// Without these mocks the component renders '0' (fallbacks on undefined data).
vi.mock('@/lib/trpc', () => ({
  trpc: {
    lead: {
      stats: {
        useQuery: () => ({ data: { total: 1240 }, isLoading: false }),
      },
    },
    analytics: {
      getOverview: {
        useQuery: () => ({ data: { leadDelta: 100 }, isLoading: false }),
      },
    },
  },
}));

import { ActiveLeadsWidget } from '../ActiveLeadsWidget';

describe('ActiveLeadsWidget', () => {
  it('shows active leads total', () => {
    render(<ActiveLeadsWidget />);

    expect(screen.getByText('Active Leads')).toBeInTheDocument();
    // Source formats via `.toLocaleString('en-GB')` — 1240 → '1,240'.
    expect(screen.getByText('1,240')).toBeInTheDocument();
  });
});
