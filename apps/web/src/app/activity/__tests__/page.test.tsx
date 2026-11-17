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
  ActivityFeedTypeFilter: ({ onChange }: Readonly<{ onChange: (value: string) => void }>) => (
    <button type="button" onClick={() => onChange('CALL')}>
      choose calls
    </button>
  ),
}));

import ActivityPage from '../page';
import { PERSONAL_FEED_TYPES, SYSTEM_FEED_TYPES } from '@/lib/activity/activity-log-split';

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

/** The person-written query is called with the person-written types, the system one with its own. */
function mockFeeds(personal: unknown[], system: unknown[], personalOverrides = {}) {
  mockUseActivityFeed.mockImplementation((options: { types?: string[] }) =>
    options.types === SYSTEM_FEED_TYPES ? feed(system) : feed(personal, personalOverrides)
  );
}

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActivityFeedSearch.mockReturnValue({
      ...feed([]),
      isSearchActive: false,
    });
  });

  it('shows his own entries first and folds the system entries into one group', () => {
    mockFeeds(
      [item('p1', 'Call with Acme', 'CALL', me), item('p2', 'Email to Bob', 'EMAIL', bob)],
      [
        item('s1', 'Lead lost, moved by the COA sync', 'STATUS_CHANGE', coa),
        item('s2', 'Lead scored COLD', 'SCORE_UPDATE', coa),
      ]
    );

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

  it('asks the server for the person-written types and the system types separately', () => {
    mockFeeds([], []);

    render(<ActivityPage />);

    const calls = mockUseActivityFeed.mock.calls.map(([options]) => options);
    expect(calls.some((o) => o.types === PERSONAL_FEED_TYPES && o.enabled)).toBe(true);
    expect(calls.some((o) => o.types === SYSTEM_FEED_TYPES && o.enabled)).toBe(true);
  });

  it('moves an entry written by "System (...)" into the group even when its type is a note', () => {
    mockFeeds([item('p1', 'Imported note', 'NOTE', coa), item('p2', 'My note', 'NOTE', me)], []);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).queryByText('Imported note')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System updates \(1\)/ })).toBeInTheDocument();
  });

  it('says only system updates exist when there is nothing person-written yet', () => {
    mockFeeds([], [item('s1', 'Lead scored COLD', 'SCORE_UPDATE', coa)]);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).getByText(
        'No emails, calls, notes or meetings yet. Only system updates so far.'
      )
    ).toBeInTheDocument();
  });

  it('My activity keeps only his own entries and hides the system group', () => {
    mockFeeds(
      [item('p1', 'Call with Acme', 'CALL', me), item('p2', 'Email to Bob', 'EMAIL', bob)],
      [item('s1', 'Lead scored COLD', 'SCORE_UPDATE', coa)]
    );

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

  it('shows a chosen type as it is, with no system group', () => {
    mockFeeds([item('p1', 'Call with Acme', 'CALL', me)], [item('s1', 'x', 'SYSTEM', coa)]);

    render(<ActivityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'choose calls' }));

    expect(screen.queryByRole('button', { name: /System updates/ })).not.toBeInTheDocument();
    const calls = mockUseActivityFeed.mock.calls.map(([options]) => options);
    expect(calls.some((o) => Array.isArray(o.types) && o.types.join() === 'CALL')).toBe(true);
  });

  it('keeps loading older pages while the person-written feed is short', () => {
    mockFeeds([item('p1', 'Call with Acme', 'CALL', me)], [], { hasNextPage: true });

    render(<ActivityPage />);

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('does not keep loading once the feed has enough entries', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`p${i}`, `Call ${i}`, 'CALL', me));
    mockFeeds(many, [], { hasNextPage: true });

    render(<ActivityPage />);

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });

  it('splits a search result the same way', () => {
    mockUseActivityFeedSearch.mockReturnValue({
      ...feed([
        item('p1', 'Call with Acme', 'CALL', me),
        item('s1', 'Acme lead scored', 'SCORE_UPDATE', coa),
      ]),
      isSearchActive: true,
    });
    mockFeeds([], []);

    render(<ActivityPage />);

    expect(
      within(screen.getByTestId('personal-feed')).getByText('Call with Acme')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System updates \(1\)/ })).toBeInTheDocument();
  });
});
