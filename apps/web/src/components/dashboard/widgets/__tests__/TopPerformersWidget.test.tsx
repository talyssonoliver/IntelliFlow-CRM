// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      topPerformers: {
        useQuery: () => ({
          data: [
            { userId: 'u1', name: 'Sarah Johnson', dealCount: 12, totalRevenue: 120000 },
            { userId: 'u2', name: 'Mike Chen', dealCount: 10, totalRevenue: 95000 },
            { userId: 'u3', name: 'Ana Lopez', dealCount: 8, totalRevenue: 80000 },
            { userId: 'u4', name: 'James Park', dealCount: 6, totalRevenue: 55000 },
          ],
          isLoading: false,
        }),
      },
    },
  },
}));

import { TopPerformersWidget } from '../TopPerformersWidget';

describe('TopPerformersWidget', () => {
  it('lists top performers', () => {
    render(<TopPerformersWidget />);
    expect(screen.getByText('Top Performers')).toBeInTheDocument();
    expect(screen.getAllByText(/\d+ deals/)).toHaveLength(4);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
  });
});
