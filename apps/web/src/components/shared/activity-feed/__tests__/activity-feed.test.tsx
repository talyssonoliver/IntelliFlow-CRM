/**
 * Activity Feed Component Tests
 * IFC-069: Unified Activity Feed Service
 *
 * Tests for ActivityFeed, ActivityFeedItem, and ActivityFeedFilters components.
 * Target: >=85% coverage for frontend components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockUseActivityFeed } = vi.hoisted(() => ({
  mockUseActivityFeed: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: mockUseActivityFeed,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
  })),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@intelliflow/domain', () => ({
  ACTIVITY_FEED_TYPES: [
    'EMAIL',
    'CALL',
    'MEETING',
    'NOTE',
    'TASK',
    'CHAT',
    'DOCUMENT',
    'DEAL',
    'TICKET',
    'STAGE_CHANGE',
    'STATUS_CHANGE',
    'SCORE_UPDATE',
    'QUALIFICATION',
    'AGENT_ACTION',
    'SLA_ALERT',
    'ASSIGNMENT',
    'SYSTEM',
  ],
  ACTIVITY_FEED_SOURCES: [
    'LEAD_ACTIVITY',
    'CONTACT_ACTIVITY',
    'OPPORTUNITY_EVENT',
    'TICKET_ACTIVITY',
    'EMAIL',
    'CALL',
    'CHAT',
  ],
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockItems = [
  {
    id: 'item-1',
    source: 'EMAIL',
    type: 'EMAIL',
    title: 'Email sent to John Doe',
    description: 'Follow-up about proposal',
    timestamp: new Date('2026-02-15T10:00:00Z'),
    actor: { id: 'user-1', name: 'Jane Smith', avatarUrl: null },
    entity: { id: 'lead-1', type: 'lead', name: 'John Doe' },
    metadata: null,
  },
  {
    id: 'item-2',
    source: 'CALL',
    type: 'CALL',
    title: 'Call with Acme Corp',
    description: 'Discussed pricing',
    timestamp: new Date('2026-02-15T09:30:00Z'),
    actor: { id: 'user-2', name: 'Bob Wilson', avatarUrl: null },
    entity: { id: 'contact-1', type: 'contact', name: 'Alice Brown' },
    metadata: { duration: 300, sentiment: 'positive' },
  },
  {
    id: 'item-3',
    source: 'OPPORTUNITY_EVENT',
    type: 'STAGE_CHANGE',
    title: 'Deal moved to Negotiation',
    description: null,
    timestamp: new Date('2026-02-15T08:00:00Z'),
    actor: null,
    entity: { id: 'opp-1', type: 'opportunity', name: 'Enterprise Deal' },
    metadata: { stageFrom: 'Proposal', stageTo: 'Negotiation' },
  },
];

// ---------------------------------------------------------------------------
// ActivityFeed Tests
// ---------------------------------------------------------------------------

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActivityFeed.mockReturnValue({
      items: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it('should render loading skeleton state', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: [],
      isLoading: true,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    const { container } = render(<ActivityFeed />);

    // Should show animated pulse skeleton placeholders
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render error state', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: [],
      isLoading: false,
      isError: true,
      error: { message: 'Network error' },
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getByText('Network error')).toBeDefined();
  });

  it('should render error state with default message', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: [],
      isLoading: false,
      isError: true,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getByText('Failed to load activity feed')).toBeDefined();
  });

  it('should render empty state with default message', async () => {
    // 'No recent activity' renders in both the EmptyState title and possibly
    // the section heading — use getAllByText to tolerate duplicates.
    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getAllByText('No recent activity').length).toBeGreaterThan(0);
  });

  it('should render empty state with custom message', async () => {
    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed emptyMessage="Nothing to show" />);

    expect(screen.getByText('Nothing to show')).toBeDefined();
  });

  it('should render "Load More Updates" button when hasNextPage', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getByText('Load More Updates')).toBeDefined();
  });

  it('should show loading indicator when fetching next page', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: true,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('should show "all caught up" when no more pages', async () => {
    mockUseActivityFeed.mockReturnValue({
      items: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    expect(screen.getByText("You're all caught up")).toBeDefined();
  });

  it('should call fetchNextPage when "Load More" is clicked', async () => {
    const fetchNextPage = vi.fn();
    mockUseActivityFeed.mockReturnValue({
      items: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage,
      refetch: vi.fn(),
    });

    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed />);

    fireEvent.click(screen.getByText('Load More Updates'));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('should render in external data mode when items are provided', async () => {
    const { ActivityFeed } = await import('../ActivityFeed');
    render(<ActivityFeed items={mockItems} isLoading={false} hasNextPage={false} />);

    expect(screen.getByText("You're all caught up")).toBeDefined();
  });

  it('should apply custom className', async () => {
    const { ActivityFeed } = await import('../ActivityFeed');
    const { container } = render(<ActivityFeed className="custom-class" />);

    expect(container.querySelector('.custom-class')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ActivityFeedItem Tests
// ---------------------------------------------------------------------------

describe('ActivityFeedItem', () => {
  it('should render item with title and description', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Email sent to John"
        description="Follow-up about proposal"
        timestamp={new Date('2026-02-15T10:00:00Z')}
        actor={{ id: 'user-1', name: 'Jane Smith', avatarUrl: null }}
        entity={{ id: 'lead-1', type: 'lead', name: 'John Doe' }}
        metadata={null}
      />
    );

    expect(screen.getByText('Email sent to John')).toBeDefined();
  });

  it('should render actor initials when actor has name', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Test"
        description={null}
        timestamp={new Date()}
        actor={{ id: 'user-1', name: 'Jane Smith', avatarUrl: null }}
        entity={null}
        metadata={null}
      />
    );

    expect(container.textContent).toContain('JS');
  });

  it('should render AI initials for AGENT_ACTION type', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="AGENT_ACTION"
        title="AI scored lead"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={null}
      />
    );

    expect(container.textContent).toContain('AI');
  });

  it('names a known entity in plain text and links the title to it (one link)', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="NOTE"
        title="Note added"
        description="Some note text."
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'lead-123', type: 'lead', name: 'Test Lead' }}
        metadata={null}
      />
    );

    expect(screen.getByText('Test Lead').closest('a')).toBeNull();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/leads/lead-123?activityId=item-1');
  });

  it('links the title of an opportunity row to /deals/', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="OPPORTUNITY_EVENT"
        type="STAGE_CHANGE"
        title="Stage changed"
        description="Moved to negotiation"
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'opp-1', type: 'opportunity', name: 'Big Deal' }}
        metadata={{ stageFrom: 'Proposal', stageTo: 'Negotiation' }}
      />
    );

    const link = screen.getByRole('link', { name: 'Stage changed' });
    expect(link.getAttribute('href')).toBe('/deals/opp-1?activityId=item-1');
  });

  it('should render title as link to entity route when entity is known', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="SYSTEM"
        title="Web Form Submission"
        description="Lead source: Request a Demo."
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'lead-abc', type: 'lead', name: 'Marcus Reed' }}
        metadata={null}
      />
    );

    const titleLink = screen.getByRole('link', { name: 'Web Form Submission' });
    expect(titleLink.getAttribute('href')).toBe('/leads/lead-abc?activityId=item-1');
  });

  it('should render title as link to actionUrl when entity route is unavailable', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="SYSTEM"
        type="SCORE_UPDATE"
        title="Scoring run completed"
        description="Model v2.1"
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ actionUrl: '/reports/scoring', actionLabel: 'View Report' }}
      />
    );

    const titleLink = screen.getByRole('link', { name: 'Scoring run completed' });
    expect(titleLink.getAttribute('href')).toBe('/reports/scoring?activityId=item-1');
  });

  it('should render stage change tags from metadata', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="OPPORTUNITY_EVENT"
        type="STAGE_CHANGE"
        title="Deal moved"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ stageFrom: 'Proposal', stageTo: 'Negotiation' }}
      />
    );

    expect(screen.getByText('Negotiation')).toBeDefined();
  });

  it('should render call metadata (duration, sentiment)', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="CALL"
        type="CALL"
        title="Call with client"
        description={null}
        timestamp={new Date()}
        actor={{ id: 'u1', name: 'Rep One', avatarUrl: null }}
        entity={null}
        metadata={{ duration: 125, sentiment: 'positive' }}
      />
    );

    // Duration: 2m 05s
    expect(container.textContent).toContain('2m 05s');
    // Sentiment tag
    expect(screen.getByText('positive')).toBeDefined();
  });

  it('should render email metadata (open count, click count)', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Email sent"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ openCount: 3, clickCount: 1, status: 'opened' }}
      />
    );

    expect(container.textContent).toContain('Opened 3x');
    expect(container.textContent).toContain('1 clicks');
    expect(screen.getByText('opened')).toBeDefined();
  });

  it('should render attachment preview', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="DOCUMENT"
        title="Document uploaded"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ attachment: { filename: 'report.pdf', url: '/files/report.pdf' } }}
      />
    );

    const link = screen.getByText('report.pdf');
    expect(link.closest('a')?.getAttribute('href')).toBe('/files/report.pdf');
  });

  it('should render attachment without link when no url', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="DOCUMENT"
        title="Document uploaded"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ attachment: { filename: 'notes.docx' } }}
      />
    );

    const el = screen.getByText('notes.docx');
    expect(el.tagName).toBe('SPAN');
  });

  it('sends the title to the action URL instead of a second action link', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="SCORE_UPDATE"
        title="Lead score updated"
        description="Score increased to 85"
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ actionUrl: '/reports/scoring', actionLabel: 'View Report' }}
      />
    );

    expect(screen.queryByText('View Report')).toBeNull();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/reports/scoring?activityId=item-1');
  });

  it('keeps an entity link when the title leads to a different action URL', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Proposal sent"
        description="Opened twice"
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'lead-9', type: 'lead', name: 'Bakery Ltd' }}
        metadata={{ actionUrl: '/email/abc' }}
      />
    );

    expect(screen.getByRole('link', { name: 'Proposal sent' }).getAttribute('href')).toBe(
      '/email/abc?activityId=item-1'
    );
    expect(screen.getByRole('link', { name: 'Bakery Ltd' }).getAttribute('href')).toBe(
      '/leads/lead-9'
    );
  });

  it('keeps the entity link when the title names it but opens another target', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="email_1"
        source="EMAIL"
        type="EMAIL"
        title="Re: quote for ana@bakery.example"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'c-1', type: 'contact', name: 'ana@bakery.example' }}
        metadata={{ actionUrl: '/email/1' }}
      />
    );

    expect(screen.getByRole('link', { name: 'ana@bakery.example' }).getAttribute('href')).toBe(
      '/contacts/c-1'
    );
  });

  it('does not repeat the entity name when the title already carries it', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="NOTE"
        title="Lead contacted — Bakery Ltd"
        description="Moved from New to Contacted by the COA sync · 3 Nov, 10:28"
        timestamp={new Date()}
        actor={{ id: null, name: 'System (COA sync)' }}
        entity={{ id: 'lead-9', type: 'lead', name: 'Bakery Ltd' }}
        metadata={null}
      />
    );

    expect(container.textContent?.match(/Bakery Ltd/g)).toHaveLength(1);
    // The system actor gets the type icon, not "S(" initials
    expect(container.textContent).not.toContain('S(');
    expect(container.textContent).toContain('sticky_note_2');
  });

  it('shows initials for a person and ignores punctuation', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="LEAD_ACTIVITY"
        type="NOTE"
        title="Note"
        description={null}
        timestamp={new Date()}
        actor={{ id: 'u1', name: 'Ana (Sales) Lima' }}
        entity={null}
        metadata={null}
      />
    );

    expect(container.textContent).toContain('AS');
    expect(container.textContent).not.toContain('sticky_note_2');
  });

  it('puts the time under the title with the absolute date as a tooltip', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const when = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="SYSTEM"
        type="SYSTEM"
        title="Imported"
        description={null}
        timestamp={when}
        actor={null}
        entity={null}
        metadata={null}
      />
    );

    const time = container.querySelector('time')!;
    expect(time.textContent).toBe('3h ago');
    expect(time.getAttribute('dateTime')).toBe(when.toISOString());
    expect(time.getAttribute('title')).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
  });

  it('renders the compact variant without tags or attachments', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Email sent"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ status: 'opened', attachment: { filename: 'a.pdf' } }}
        variant="compact"
      />
    );

    expect(container.querySelector('[data-variant="compact"]')).not.toBeNull();
    expect(screen.queryByText('opened')).toBeNull();
    expect(screen.queryByText('a.pdf')).toBeNull();
  });

  it('should format relative time correctly', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');

    // Just now
    render(
      <ActivityFeedItem
        id="item-now"
        source="SYSTEM"
        type="SYSTEM"
        title="Test now"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={null}
      />
    );

    expect(screen.getByText('just now')).toBeDefined();
  });

  it('should render entity name as span when route is unknown', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="item-1"
        source="SYSTEM"
        type="SYSTEM"
        title="System event"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={{ id: 'x-1', type: 'unknown_type', name: 'Unknown Entity' }}
        metadata={null}
      />
    );

    const el = screen.getByText('Unknown Entity');
    expect(el.tagName).toBe('SPAN');
  });

  it('should render email item as clickable link via actionUrl in metadata', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    render(
      <ActivityFeedItem
        id="email_abc123"
        source="EMAIL"
        type="EMAIL"
        title="Your Custom Proposal from IntelliFlow"
        description="From: user@example.com → To: ."
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ status: 'PENDING', openCount: 0, clickCount: 0, actionUrl: '/email/abc123' }}
      />
    );

    const titleLink = screen.getByRole('link', { name: 'Your Custom Proposal from IntelliFlow' });
    expect(titleLink.getAttribute('href')).toBe('/email/abc123?activityId=email_abc123');
  });

  it('should apply selected highlight when isSelected is true', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Selected item"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ actionUrl: '/email/123' }}
        isSelected={true}
      />
    );

    const wrapper = container.querySelector('[data-activity-id="item-1"]');
    expect(wrapper?.className).toContain('ring-2');
    expect(wrapper?.className).toContain('bg-primary/5');
  });

  it('should not apply selected highlight when isSelected is false', async () => {
    const { ActivityFeedItem } = await import('../ActivityFeedItem');
    const { container } = render(
      <ActivityFeedItem
        id="item-1"
        source="EMAIL"
        type="EMAIL"
        title="Unselected item"
        description={null}
        timestamp={new Date()}
        actor={null}
        entity={null}
        metadata={{ actionUrl: '/email/123' }}
        isSelected={false}
      />
    );

    const wrapper = container.querySelector('[data-activity-id="item-1"]');
    expect(wrapper?.className).not.toContain('ring-2');
    expect(wrapper?.className).toContain('hover:bg-slate-50');
  });
});

// ---------------------------------------------------------------------------
// ActivityFeedFilters Tests
// ---------------------------------------------------------------------------

describe('ActivityFeedFilters', () => {
  it('should render search input', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('Search activity...')).toBeDefined();
  });

  it('should render type filter chips', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    expect(screen.getByText('Email')).toBeDefined();
    expect(screen.getByText('Call')).toBeDefined();
    expect(screen.getByText('Meeting')).toBeDefined();
    expect(screen.getByText('AI Action')).toBeDefined();
  });

  it('should call onChange when search input changes', async () => {
    const onChange = vi.fn();
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search activity...');
    fireEvent.change(input, { target: { value: 'test query' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'test query' }));
  });

  it('should toggle type filter on click', async () => {
    const onChange = vi.fn();
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={onChange} />);

    fireEvent.click(screen.getByText('Email'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ types: ['EMAIL'] }));
  });

  it('should remove type filter when clicked again', async () => {
    const onChange = vi.fn();
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(
      <ActivityFeedFilters
        values={{ types: ['EMAIL'], search: '', sources: [] }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Email'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ types: [] }));
  });

  it('should not show source chips by default', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    expect(screen.queryByText('Leads')).toBeNull();
  });

  it('should show source chips when showSources is true', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} showSources />);

    expect(screen.getByText('Leads')).toBeDefined();
    expect(screen.getByText('Contacts')).toBeDefined();
    expect(screen.getByText('Deals')).toBeDefined();
  });

  it('should toggle source filter on click', async () => {
    const onChange = vi.fn();
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={onChange} showSources />);

    fireEvent.click(screen.getByText('Leads'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sources: ['LEAD_ACTIVITY'] }));
  });

  it('should not show date range by default', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Activity after date')).toBeNull();
  });

  it('should show date range when showDateRange is true', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} showDateRange />);

    expect(screen.getByLabelText('Activity after date')).toBeDefined();
    expect(screen.getByLabelText('Activity before date')).toBeDefined();
  });

  it('should show "Clear all filters" when filters are active', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(
      <ActivityFeedFilters values={{ search: 'test', types: [], sources: [] }} onChange={vi.fn()} />
    );

    expect(screen.getByText('Clear all filters')).toBeDefined();
  });

  it('should not show "Clear all filters" when no filters active', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    expect(screen.queryByText('Clear all filters')).toBeNull();
  });

  it('should clear all filters when clear button is clicked', async () => {
    const onChange = vi.fn();
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(
      <ActivityFeedFilters
        values={{ search: 'test', types: ['EMAIL'], sources: ['CALL'] }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Clear all filters'));

    expect(onChange).toHaveBeenCalledWith({
      search: '',
      types: [],
      sources: [],
    });
  });

  it('should have proper ARIA labels on filter chips', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} />);

    const emailChip = screen.getByLabelText('Filter by Email');
    expect(emailChip).toBeDefined();
    expect(emailChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('should set aria-pressed on active filter chips', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(
      <ActivityFeedFilters
        values={{ search: '', types: ['EMAIL'], sources: [] }}
        onChange={vi.fn()}
      />
    );

    const emailChip = screen.getByLabelText('Filter by Email');
    expect(emailChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('should apply custom className', async () => {
    const { ActivityFeedFilters } = await import('../ActivityFeedFilters');
    render(<ActivityFeedFilters onChange={vi.fn()} className="my-filters" />);

    expect(screen.getByTestId('activity-feed-filters').classList.contains('my-filters')).toBe(true);
  });
});
