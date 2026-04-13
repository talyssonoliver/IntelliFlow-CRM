// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UpcomingEventsWidget } from '../UpcomingEventsWidget';

// Mock tRPC api with one sample appointment so EmptyState (which uses
// IntersectionObserver — unavailable in jsdom) doesn't render.
vi.mock('@/lib/api', () => ({
  api: {
    appointments: {
      list: {
        useQuery: () => ({
          data: {
            appointments: [
              {
                id: 'appt-1',
                title: 'Sample meeting',
                startTime: new Date(Date.now() + 86400000).toISOString(),
                endTime: new Date(Date.now() + 90000000).toISOString(),
                appointmentType: 'MEETING',
                status: 'SCHEDULED',
                attendees: [],
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
            hasMore: false,
          },
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (src: string | null) => src,
  isAvatarImageSource: () => true,
}));

describe('UpcomingEventsWidget', () => {
  it('renders the appointments-focused title', () => {
    render(<UpcomingEventsWidget />);
    expect(screen.getByText('Upcoming Appointments')).toBeInTheDocument();
  });
});
