/**
 * QuickActionHrefs Tests (PG-155)
 *
 * Data-layer tests: Verify ALL_QUICK_ACTIONS href values and comingSoon flags.
 * DOM-layer tests: Verify rendering (Link vs button) and toast behavior.
 *
 * Covers AC-001 through AC-012, NF-003.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — mock references
// ---------------------------------------------------------------------------
const {
  mockWelcomeQuery,
  mockInsightsQuery,
  mockUseActivityFeed,
  mockGoalQuery,
  mockPinnedQuery,
  mockUnpinMutation,
  mockToast,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  return {
    mockWelcomeQuery: vi.fn(),
    mockInsightsQuery: vi.fn(),
    mockUseActivityFeed: vi.fn(),
    mockGoalQuery: vi.fn(),
    mockPinnedQuery: vi.fn(),
    mockUnpinMutation: vi.fn(() => ({ mutate: mockMutate, isLoading: false })),
    mockMutate,
    mockToast: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/trpc', () => ({
  trpc: {
    home: {
      getWelcomeSummary: { useQuery: mockWelcomeQuery },
      getAIInsights: { useQuery: mockInsightsQuery },
      getDailyGoal: { useQuery: mockGoalQuery },
      getPinnedItems: { useQuery: mockPinnedQuery },
      unpinItem: { useMutation: mockUnpinMutation },
      updateDailyGoal: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
      reorderPinnedItems: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
    },
    notifications: {
      getUnreadCount: {
        useQuery: vi.fn(() => ({ data: { total: 0, byPriority: {} }, isLoading: false })),
      },
      list: { useQuery: vi.fn(() => ({ data: { notifications: [] }, isLoading: false })) },
      markAsRead: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
      markAllAsRead: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
    },
    useUtils: vi.fn(() => ({
      activityFeed: { getUnifiedFeed: { invalidate: vi.fn() } },
      home: { getDailyGoal: { invalidate: vi.fn() } },
      notifications: {
        getUnreadCount: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    })),
  },
}));

vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: mockUseActivityFeed,
}));

vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: () => <div data-testid="activity-feed-mock" />,
  ActivityFeedStatsBar: () => <div data-testid="activity-feed-stats-bar" />,
  ActivityFeedTypeFilter: () => <button aria-label="Filter activity feed">filter_list</button>,
}));

vi.mock('@/components/notifications', () => ({
  NotificationItem: ({ notification }: any) => (
    <div data-testid={`notification-item-${notification.id}`}>{notification.title}</div>
  ),
  NotificationItemSkeleton: () => <div data-testid="notification-skeleton" />,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  arrayMove: vi.fn((_arr: unknown[], _from: number, _to: number) => []),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('../DraggablePinnedItem', () => ({
  DraggablePinnedItem: ({ item }: any) => <div>{item.title}</div>,
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  })),
}));

vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/ui');
  return {
    ...actual,
    toast: mockToast,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { ALL_QUICK_ACTIONS } from '../PinnedItemsSheet';
import type { QuickActionDef } from '../PinnedItemsSheet';
import { AuthenticatedHomePage } from '../AuthenticatedHomePage';

// ---------------------------------------------------------------------------
// Helper: set up default query return values
// ---------------------------------------------------------------------------
function setupDefaultMocks() {
  mockWelcomeQuery.mockReturnValue({
    data: { userName: 'Test', greeting: 'Hello', stats: undefined },
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockInsightsQuery.mockReturnValue({
    data: { insights: [], lastRefreshed: new Date().toISOString() },
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
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
  mockGoalQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockPinnedQuery.mockReturnValue({
    data: { items: [], maxItems: 10 },
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// Helper to find action by ID
// ---------------------------------------------------------------------------
function findAction(id: string): QuickActionDef {
  const action = ALL_QUICK_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`Action ${id} not found`);
  return action;
}

// ===========================================================================
// DATA-LAYER TESTS (no DOM)
// ===========================================================================
describe('QuickActionHrefs — Data Layer', () => {
  // TC-01
  it('ALL_QUICK_ACTIONS has exactly 8 entries', () => {
    expect(ALL_QUICK_ACTIONS).toHaveLength(8);
  });

  // TC-02
  it('action-call has href /calls/new and comingSoon: true', () => {
    const action = findAction('action-call');
    expect(action.href).toBe('/calls/new');
    expect(action.comingSoon).toBe(true);
  });

  // TC-03
  it('action-email has href /email', () => {
    expect(findAction('action-email').href).toBe('/email');
  });

  // TC-04
  it('action-meeting has href /calendar/new', () => {
    expect(findAction('action-meeting').href).toBe('/calendar/new');
  });

  // TC-05
  it('action-task has href /tasks', () => {
    expect(findAction('action-task').href).toBe('/tasks');
  });

  // TC-06
  it('action-lead has href /leads/new', () => {
    expect(findAction('action-lead').href).toBe('/leads/new');
  });

  // TC-07
  it('action-deal has href /deals', () => {
    expect(findAction('action-deal').href).toBe('/deals');
  });

  // TC-08
  it('action-document has href /documents/new', () => {
    expect(findAction('action-document').href).toBe('/documents/new');
  });

  // TC-09
  it('action-report has href /reports/new and comingSoon: true', () => {
    const action = findAction('action-report');
    expect(action.href).toBe('/reports/new');
    expect(action.comingSoon).toBe(true);
  });

  // TC-10
  it('only action-call and action-report have comingSoon: true', () => {
    const comingSoonActions = ALL_QUICK_ACTIONS.filter((a) => a.comingSoon === true);
    expect(comingSoonActions).toHaveLength(2);
    expect(comingSoonActions.map((a) => a.id).sort()).toEqual(['action-call', 'action-report']);
  });

  // TC-11
  it('no duplicate action IDs exist', () => {
    const ids = ALL_QUICK_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // TC-12
  it('all non-comingSoon hrefs start with / and have no query params', () => {
    const nonComingSoon = ALL_QUICK_ACTIONS.filter((a) => !a.comingSoon);
    for (const a of nonComingSoon) {
      expect(a.href.startsWith('/')).toBe(true);
      expect(a.href).not.toContain('?');
    }
  });
});

// ===========================================================================
// DOM-LAYER TESTS (render AuthenticatedHomePage Quick Actions section)
// ===========================================================================
describe('QuickActionHrefs — DOM Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // TC-13
  it('non-comingSoon actions render as links with correct href', () => {
    render(<AuthenticatedHomePage />);

    // Default enabled: action-call, action-email, action-meeting, action-task
    // action-email (non-comingSoon) should be a link
    const emailLink = screen.getByText('Send Email').closest('a');
    expect(emailLink).not.toBeNull();
    expect(emailLink).toHaveAttribute('href', '/email');

    // action-meeting (non-comingSoon) should be a link
    const meetingLink = screen.getByText('Schedule Meeting').closest('a');
    expect(meetingLink).not.toBeNull();
    expect(meetingLink).toHaveAttribute('href', '/calendar/new');

    // action-task (non-comingSoon) should be a link
    const taskLink = screen.getByText('Create Task').closest('a');
    expect(taskLink).not.toBeNull();
    expect(taskLink).toHaveAttribute('href', '/tasks');
  });

  // TC-14
  it('coming-soon actions render as buttons, not links', () => {
    render(<AuthenticatedHomePage />);

    // action-call (comingSoon) should be a button
    const callButton = screen.getByText('Log Call').closest('button');
    expect(callButton).not.toBeNull();
    expect(callButton).toHaveAttribute('type', 'button');

    // Should NOT be wrapped in a link
    const callLink = screen.getByText('Log Call').closest('a');
    expect(callLink).toBeNull();
  });

  // TC-15
  it('clicking a coming-soon button invokes toast with action label', () => {
    render(<AuthenticatedHomePage />);

    const callButton = screen.getByText('Log Call').closest('button')!;
    fireEvent.click(callButton);

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      description: 'Log Call is coming soon! This feature is under development.',
    });
  });

  // TC-16
  it('clicking a coming-soon button does NOT navigate (no <a> tag)', () => {
    render(<AuthenticatedHomePage />);

    const callButton = screen.getByText('Log Call').closest('button')!;
    fireEvent.click(callButton);

    // Verify no link surrounds the button
    expect(screen.getByText('Log Call').closest('a')).toBeNull();
  });

  // TC-17
  it('default 4 enabled actions all render correctly', () => {
    render(<AuthenticatedHomePage />);

    // All 4 default actions should be visible
    expect(screen.getByText('Log Call')).toBeInTheDocument();
    expect(screen.getByText('Send Email')).toBeInTheDocument();
    expect(screen.getByText('Schedule Meeting')).toBeInTheDocument();
    expect(screen.getByText('Create Task')).toBeInTheDocument();
  });

  // TC-18
  it('all visible Quick Actions have accessible label text', () => {
    render(<AuthenticatedHomePage />);

    const labels = ['Log Call', 'Send Email', 'Schedule Meeting', 'Create Task'];
    for (const label of labels) {
      const el = screen.getByText(label);
      expect(el).toBeInTheDocument();
      expect(el.textContent).toBeTruthy();
    }
  });
});
