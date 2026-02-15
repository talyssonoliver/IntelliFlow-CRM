// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UpcomingEventsWidget } from '../UpcomingEventsWidget';

// Mock tRPC api
vi.mock('@/lib/api', () => ({
  api: {
    appointments: {
      list: {
        useQuery: () => ({ data: { appointments: [], total: 0, page: 1, limit: 20, hasMore: false }, isLoading: false, error: null }),
      },
    },
  },
}));

vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (src: string | null) => src,
  isAvatarImageSource: () => true,
}));

describe('UpcomingEventsWidget', () => {
  it('renders upcoming events title', () => {
    render(<UpcomingEventsWidget />);
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
  });

  it('shows empty state when no events', () => {
    render(<UpcomingEventsWidget />);
    expect(screen.getByText('No upcoming events')).toBeInTheDocument();
  });
});
