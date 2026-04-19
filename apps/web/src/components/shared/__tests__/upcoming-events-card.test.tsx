import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingEventsCard } from '../upcoming-events-card';

// Mock tRPC api
const mockUseQuery = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    appointments: {
      list: { useQuery: (...args: any[]) => mockUseQuery(...args) },
    },
    task: {
      list: {
        useQuery: () => ({ data: { tasks: [], total: 0 }, isLoading: false, error: null }),
      },
    },
  },
}));

// Mock avatar utils
vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (src: string | null) => src,
  isAvatarImageSource: () => true,
}));

const futureDate = new Date(Date.now() + 86400000); // tomorrow
const futureDate2 = new Date(Date.now() + 172800000); // day after

const mockEvents = [
  {
    id: 'appt-1',
    title: 'Product Demo',
    startTime: futureDate.toISOString(),
    endTime: new Date(futureDate.getTime() + 3600000).toISOString(),
    appointmentType: 'MEETING',
    status: 'SCHEDULED',
    attendees: [
      { user: { name: 'Alice', avatarUrl: null } },
      { user: { name: 'Bob', avatarUrl: null } },
    ],
  },
  {
    id: 'appt-2',
    title: 'Court Hearing',
    startTime: futureDate2.toISOString(),
    endTime: new Date(futureDate2.getTime() + 7200000).toISOString(),
    appointmentType: 'HEARING',
    status: 'SCHEDULED',
    attendees: [],
  },
];

/** Wrap events in the API response shape */
function apiResponse(appointments: any[]) {
  return { appointments, total: appointments.length, page: 1, limit: 20, hasMore: false };
}

describe('UpcomingEventsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<UpcomingEventsCard />);
    expect(screen.getByTestId('upcoming-events-card')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    render(<UpcomingEventsCard />);
    expect(screen.getByText('Failed to load events')).toBeInTheDocument();
  });

  it('renders empty state when no events', () => {
    // EmptyState entity="appointments" → canonical 'No appointments yet'.
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard />);
    expect(screen.getByText('No appointments yet')).toBeInTheDocument();
  });

  it('renders events with date badge, title, and time', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse(mockEvents), isLoading: false, error: null });
    render(<UpcomingEventsCard />);
    expect(screen.getByText('Product Demo')).toBeInTheDocument();
    expect(screen.getByText('Court Hearing')).toBeInTheDocument();
  });

  it('renders attendee avatars', () => {
    mockUseQuery.mockReturnValue({
      data: apiResponse([mockEvents[0]]),
      isLoading: false,
      error: null,
    });
    render(<UpcomingEventsCard />);
    // Should render avatar fallbacks for Alice and Bob
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('uses custom title', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard title="Upcoming Events" />);
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
  });

  it('hides add button when showAddButton is false', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard showAddButton={false} />);
    expect(screen.queryByLabelText('Schedule event')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule an event')).not.toBeInTheDocument();
  });

  it('passes case entity filter as caseId to query', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard entityType="case" entityId="case-123" />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-123' }),
      expect.anything()
    );
  });

  it('links add button to /appointments/new with entity params', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard entityType="contact" entityId="c-1" />);
    const addLink = screen.getByLabelText('Schedule event');
    expect(addLink).toHaveAttribute('href', '/appointments/new?linkTo=contact&linkId=c-1');
  });

  it('links add button to /appointments/new without params for global view', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    render(<UpcomingEventsCard />);
    const addLink = screen.getByLabelText('Schedule event');
    expect(addLink).toHaveAttribute('href', '/appointments/new');
  });

  it('links events to calendar detail page', () => {
    mockUseQuery.mockReturnValue({
      data: apiResponse([mockEvents[0]]),
      isLoading: false,
      error: null,
    });
    render(<UpcomingEventsCard />);
    const eventLink = screen.getByText('Product Demo').closest('a');
    expect(eventLink).toHaveAttribute('href', '/appointments/appt-1');
  });

  it('respects maxItems prop', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse(mockEvents), isLoading: false, error: null });
    render(<UpcomingEventsCard maxItems={1} />);
    expect(screen.getByText('Product Demo')).toBeInTheDocument();
    expect(screen.queryByText('Court Hearing')).not.toBeInTheDocument();
  });

  it('renders compact mode with smaller padding', () => {
    mockUseQuery.mockReturnValue({ data: apiResponse([]), isLoading: false, error: null });
    const { container } = render(<UpcomingEventsCard compact />);
    const card = container.querySelector('[data-testid="upcoming-events-card"]');
    expect(card?.className).toContain('p-4');
  });
});
