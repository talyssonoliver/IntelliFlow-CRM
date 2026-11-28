/**
 * Activity Log (MVP-005): what people did comes first; what the system wrote (COA sync, score and
 * status changes) is folded into one "System updates (n)" group; "My activity" keeps only his own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const { mockUseActivityFeed, mockUseActivityFeedSearch, mockFetchNextPage } = vi.hoisted(() => ({
  mockUseActivityFeed: vi.fn(),
  mockUseActivityFeedSearch: vi.fn(),
  mockFetchNextPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'me@example.invalid', name: 'Talysson', role: 'ADMIN' },
  }),
}));

vi.mock('@/hooks/useActivityFeed', () => ({ useActivityFeed: mockUseActivityFeed }));
vi.mock('@/hooks/useActivityFeedSearch', () => ({
  useActivityFeedSearch: mockUseActivityFeedSearch,
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: Readonly<{ title: string }>) => <h1>{title}</h1>,
}));

interface StubItem {
  id: string;
  title: string;
}

vi.mock('@/components/shared/activity-feed', () => ({
  // The two feeds are told apart by height: 680 is the person-written feed, 480 the system group.
  ActivityFeed: ({
    items,
    height,
    emptyMessage,
  }: Readonly<{ items: StubItem[]; height: number; emptyMessage?: string }>) => (
    <div data-testid={height === 680 ? 'personal-feed' : 'system-feed'}>
      {items.length === 0 && <p>{emptyMessage}</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </div>
  ),
  ActivityFeedStatsBar: () => null,
  ACTIVITY_FEED_TYPE_FILTER_OPTIONS: [
    { value: 'all', label: 'All Activity', icon: 'list' },
    { value: 'CALL', label: 'Calls', icon: 'call_received' },
  ],
}));

import ActivityPage from '../page';

const item = (
  id: string,
  title: string,
  type: string,
  actor: { id: string | null; name: string } | null
) => ({
  id,
  source: 'LEAD_ACTIVITY',
  type,
  title,
  description: null,
  timestamp: '2026-11-16T10:00:00Z',
  actor,
  entity: null,
});

const me = { id: 'user-1', name: 'Talysson' };
const bob = { id: 'user-2', name: 'Bob Wilson' };
const coa = { id: null, name: 'System (COA sync)' };

function feed(items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    isLoading: false,
    isError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: mockFetchNextPage,
    ...overrides,
  };
}

function mockFeed(items: unknown[], overrides: Record<string, unknown> = {}) {
  mockUseActivityFeed.mockReturnValue(feed(items, overrides));
}

const mixed = () => [
  item('s1', 'Lead lost, moved by the COA sync', 'STATUS_CHANGE', coa),
  item('p1', 'Call with Acme', 'CALL', me),
  item('s2', 'Lead scored COLD', 'SCORE_UPDATE', coa),
  item('p2', 'Email to Bob', 'EMAIL', bob),
];

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActivityFeedSearch.mockReturnValue({ ...feed([]), isSearchActive: false });
  });

  it('shows what people did first and folds the system entries into one group', () => {
    mockFeed(mixed());

    render(<ActivityPage />);

    const personal = within(screen.getByTestId('personal-feed'));
    expect(personal.getByText('Call with Acme')).toBeInTheDocument();
    expect(personal.getByText('Email to Bob')).toBeInTheDocument();
    expect(personal.queryByText(/COA sync/)).not.toBeInTheDocument();

    const group = screen.getByRole('button', { name: /System updates \(2\)/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('system-feed')).not.toBeInTheDocument();

    fireEvent.click(group);
    expect(within(screen.getByTestId('system-feed')).getByText(/COA sync/)).toBeInTheDocument();
  });

  it('reads the whole feed, not a type list the server would filter after limiting', () => {
    mockFeed(mixed());

    render(<ActivityPage />);

    const options = mockUseActivityFeed.mock.calls.map(([o]) => o);
    expect(options.every((o) => o.types === undefined)).toBe(true);
  });

  it('moves an entry written by "System (...)" into the group even when its type is a note', () => {
    mockFeed([item('p1', 'Imported note', 'NOTE', coa), item('p2', 'My note', 'NOTE', me)]);

    render(<ActivityPage />);

    const personal = within(screen.getByTestId('personal-feed'));
    expect(personal.queryByText('Imported note')).not.toBeInTheDocument();
    expect(personal.getByText('My note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System updates \(1\)/ })).toBeInTheDocument();
  });

  it('says only system updates exist when there is nothing person-written yet', () => {
    mockFeed([item('s1', 'Lead scored COLD', 'SCORE_UPDATE', coa)]);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).getByText(
        'No emails, calls, notes or meetings yet. Only system updates so far.'
      )
    ).toBeInTheDocument();
  });

  it('My activity keeps only his own entries and hides the system group', () => {
    mockFeed(mixed());

    render(<ActivityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'My activity' }));

    expect(screen.getByRole('button', { name: 'My activity' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const personal = within(screen.getByTestId('personal-feed'));
    expect(personal.getByText('Call with Acme')).toBeInTheDocument();
    expect(personal.queryByText('Email to Bob')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /System updates/ })).not.toBeInTheDocument();
  });

  it('shows a chosen type as it is, with no system group, and My activity still applies', () => {
    mockFeed([item('p1', 'Call with Acme', 'CALL', me), item('p2', 'Call with Bob', 'CALL', bob)]);

    render(<ActivityPage />);
    // The type is a filter of the shared toolbar now (owner 21/11).
    fireEvent.change(screen.getByLabelText('Activity type'), { target: { value: 'CALL' } });

    expect(screen.queryByRole('button', { name: /System updates/ })).not.toBeInTheDocument();
    expect(mockUseActivityFeed.mock.calls.some(([o]) => o.types?.join() === 'CALL')).toBe(true);
    let personal = within(screen.getByTestId('personal-feed'));
    expect(personal.getByText('Call with Bob')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'My activity' }));
    personal = within(screen.getByTestId('personal-feed'));
    expect(personal.getByText('Call with Acme')).toBeInTheDocument();
    expect(personal.queryByText('Call with Bob')).not.toBeInTheDocument();
  });

  it('keeps loading older pages while the person-written feed is short', () => {
    mockFeed([item('p1', 'Call with Acme', 'CALL', me)], { hasNextPage: true });

    render(<ActivityPage />);

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('does not keep loading once the feed has enough entries', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`p${i}`, `Call ${i}`, 'CALL', me));
    mockFeed(many, { hasNextPage: true });

    render(<ActivityPage />);

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });

  /** One page request finishing: the feed reports it fetching, then idle, with nothing new shown. */
  function finishPageRequests(rerender: () => void, times: number) {
    const noise = [item('s1', 'Lead scored', 'SCORE_UPDATE', coa)];
    for (let i = 0; i < times; i++) {
      mockFeed(noise, { hasNextPage: true, isFetchingNextPage: true });
      rerender();
      mockFeed(noise, { hasNextPage: true, isFetchingNextPage: false });
      rerender();
    }
  }

  it('stops loading by itself after ten page requests and offers a button to look further back', () => {
    // Entries that repeat are dropped by the feed, so the budget counts requests, not entries.
    mockFeed([item('s1', 'Lead scored', 'SCORE_UPDATE', coa)], { hasNextPage: true });

    const { rerender } = render(<ActivityPage />);
    finishPageRequests(() => rerender(<ActivityPage />), 15);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(10);
    mockFetchNextPage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('gives a new view its own budget', () => {
    mockFeed([item('s1', 'Lead scored', 'SCORE_UPDATE', coa)], { hasNextPage: true });

    const { rerender } = render(<ActivityPage />);
    finishPageRequests(() => rerender(<ActivityPage />), 15);
    expect(mockFetchNextPage).toHaveBeenCalledTimes(10);

    mockFetchNextPage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'My activity' }));
    finishPageRequests(() => rerender(<ActivityPage />), 15);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(10);
  });

  it('does not retry a failed page by itself, and the button retries it', () => {
    mockFeed([item('p1', 'Call with Acme', 'CALL', me)], {
      hasNextPage: true,
      isError: true,
      error: { message: 'Network error' },
    });

    render(<ActivityPage />);

    expect(mockFetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps a status change he made in the feed, not in the system group', () => {
    mockFeed([item('p1', 'Lead Converted', 'STATUS_CHANGE', me)]);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).getByText('Lead Converted')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /System updates/ })).not.toBeInTheDocument();
  });

  it('has no load-older button when there is nothing older or enough is shown', () => {
    mockFeed(mixed());

    render(<ActivityPage />);

    expect(screen.queryByRole('button', { name: /older activity/ })).not.toBeInTheDocument();
  });

  it('splits a search result the same way', () => {
    mockUseActivityFeedSearch.mockReturnValue({
      ...feed([
        item('p1', 'Call with Acme', 'CALL', me),
        item('s1', 'Acme lead scored', 'SCORE_UPDATE', coa),
      ]),
      isSearchActive: true,
    });
    mockFeed([]);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).getByText('Call with Acme')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System updates \(1\)/ })).toBeInTheDocument();
  });
});
