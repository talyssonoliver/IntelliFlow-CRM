/**
 * AuthenticatedHomePage Analytics Integration Tests
 *
 * Verifies that user interactions in the authenticated home page
 * trigger the correct analytics tracking calls.
 *
 * Task: PG-167 — Analytics tracking plan for home page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — analytics mocks + query mocks
// ---------------------------------------------------------------------------

const {
  mockTrackWelcomeCtaClick,
  mockTrackInsightClick,
  mockTrackInsightsViewAllClick,
  mockTrackQuickActionClick,
  mockTrackQuickActionsSettingsOpened,
  mockTrackFeedFilterChange,
  mockTrackFeedViewAllClick,
  mockTrackGoalSettingsOpened,
  mockTrackPinnedNavSettingsOpened,
  mockTrackPinnedItemsReorder,
  mockTrackPinnedItemUnpin,
  mockTrackPinnedItemClick,
  mockWelcomeQuery,
  mockInsightsQuery,
  mockUseActivityFeed,
  mockGoalQuery,
  mockPinnedQuery,
  mockMutate,
  mockReorderMutate,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  const mockReorderMutate = vi.fn();

  return {
    mockTrackWelcomeCtaClick: vi.fn(),
    mockTrackInsightClick: vi.fn(),
    mockTrackInsightsViewAllClick: vi.fn(),
    mockTrackQuickActionClick: vi.fn(),
    mockTrackQuickActionsSettingsOpened: vi.fn(),
    mockTrackFeedFilterChange: vi.fn(),
    mockTrackFeedViewAllClick: vi.fn(),
    mockTrackGoalSettingsOpened: vi.fn(),
    mockTrackPinnedNavSettingsOpened: vi.fn(),
    mockTrackPinnedItemsReorder: vi.fn(),
    mockTrackPinnedItemUnpin: vi.fn(),
    mockTrackPinnedItemClick: vi.fn(),
    mockWelcomeQuery: vi.fn(),
    mockInsightsQuery: vi.fn(),
    mockUseActivityFeed: vi.fn(),
    mockGoalQuery: vi.fn(),
    mockPinnedQuery: vi.fn(),
    mockUnpinMutation: vi.fn(() => ({
      mutate: mockMutate,
      isLoading: false,
    })),
    mockUpdateDailyGoalMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isLoading: false,
    })),
    mockReorderMutation: vi.fn(() => ({
      mutate: mockReorderMutate,
      isLoading: false,
    })),
    mockMutate,
    mockReorderMutate,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/analytics', () => ({
  trackWelcomeCtaClick: mockTrackWelcomeCtaClick,
  trackInsightClick: mockTrackInsightClick,
  trackInsightsViewAllClick: mockTrackInsightsViewAllClick,
  trackQuickActionClick: mockTrackQuickActionClick,
  trackQuickActionsSettingsOpened: mockTrackQuickActionsSettingsOpened,
  trackQuickActionsSettingsSaved: vi.fn(),
  trackFeedFilterChange: mockTrackFeedFilterChange,
  trackFeedViewAllClick: mockTrackFeedViewAllClick,
  trackGoalSettingsOpened: mockTrackGoalSettingsOpened,
  trackGoalSettingsSaved: vi.fn(),
  trackPinnedItemClick: mockTrackPinnedItemClick,
  trackPinnedItemUnpin: mockTrackPinnedItemUnpin,
  trackPinnedItemsReorder: mockTrackPinnedItemsReorder,
  trackPinnedNavSettingsOpened: mockTrackPinnedNavSettingsOpened,
  trackPinnedNavSettingsSaved: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    home: {
      getWelcomeSummary: { useQuery: mockWelcomeQuery },
      getAIInsights: { useQuery: mockInsightsQuery },
      getDailyGoal: { useQuery: mockGoalQuery },
      getPinnedItems: { useQuery: mockPinnedQuery },
      unpinItem: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
          isLoading: false,
        })),
      },
      updateDailyGoal: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isLoading: false,
        })),
      },
      reorderPinnedItems: {
        useMutation: vi.fn(() => ({
          mutate: mockReorderMutate,
          isLoading: false,
        })),
      },
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

vi.mock('@/components/notifications', () => ({
  NotificationItem: ({ notification }: any) => (
    <div data-testid={`notification-item-${notification.id}`}>{notification.title}</div>
  ),
  NotificationItemSkeleton: () => <div data-testid="notification-skeleton" />,
}));

// ---------------------------------------------------------------------------
// @dnd-kit mocks
// ---------------------------------------------------------------------------

let capturedDndProps: Record<string, unknown> = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
    ...props
  }: Record<string, unknown> & { children: React.ReactNode }) => {
    capturedDndProps = { onDragEnd, ...props };
    return <div data-testid="dnd-context">{children as React.ReactNode}</div>;
  },
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: Readonly<{ children: React.ReactNode }>) => {
    return <div data-testid="sortable-context">{children}</div>;
  },
  verticalListSortingStrategy: {},
  arrayMove: <T,>(arr: T[], from: number, to: number): T[] => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  },
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => '' },
    Transition: { toString: () => '' },
  },
}));

// Mock DraggablePinnedItem to capture onItemClick
let capturedOnUnpin: ((entityType: string, entityId: string) => void) | undefined;
let capturedOnItemClick: ((entityType: string, entityId: string) => void) | undefined;

vi.mock('../DraggablePinnedItem', () => ({
  DraggablePinnedItem: ({ item, onUnpin, onItemClick }: any) => {
    capturedOnUnpin = onUnpin;
    capturedOnItemClick = onItemClick;
    return (
      <div data-testid={`draggable-pinned-${item.entityType}-${item.entityId}`}>
        <a
          href={item.url}
          onClick={(e) => {
            e.preventDefault();
            onItemClick?.(item.entityType, item.entityId);
          }}
          data-testid={`pinned-link-${item.entityType}-${item.entityId}`}
        >
          {item.title}
        </a>
        {onUnpin && (
          <button
            data-testid={`unpin-${item.entityType}-${item.entityId}`}
            onClick={() => onUnpin(item.entityType, item.entityId)}
          >
            Unpin
          </button>
        )}
      </div>
    );
  },
}));

// Mock ActivityFeed
vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: (_props: any) => {
    const feed = mockUseActivityFeed();
    if (feed.isLoading) return <div>Loading...</div>;
    if (feed.items.length === 0) return <div>No recent activity</div>;
    return (
      <div data-testid="activity-feed">
        {feed.items.map((item: any) => (
          <div key={item.id}>{item.title}</div>
        ))}
      </div>
    );
  },
  ActivityFeedStatsBar: () => <div data-testid="activity-feed-stats-bar" />,
  ActivityFeedTypeFilter: ({
    value,
    onChange,
  }: Readonly<{
    value: string;
    onChange: (value: string) => void;
  }>) => {
    const [open, setOpen] = React.useState(false);
    return (
      <div>
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-label={value === 'all' ? 'Filter activity feed' : `Filter: ${value}`}
        >
          Filter
        </button>
        {open && (
          <button
            data-testid="filter-option-CALL"
            onClick={() => {
              onChange('CALL');
              setOpen(false);
            }}
          >
            Calls
          </button>
        )}
      </div>
    );
  },
}));

// Mock NotificationsSummaryWidget to avoid deep tRPC dependency
vi.mock('../NotificationsSummaryWidget', () => ({
  NotificationsSummaryWidget: () => <div data-testid="notifications-summary" />,
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', name: 'Alice Smith', email: 'alice@example.com' },
    isAuthenticated: true,
    isLoading: false,
  })),
}));

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const welcomeData = {
  userName: 'Alice',
  greeting: 'Good morning',
  todayDate: new Date('2026-02-09T10:00:00Z'),
  stats: {
    highPriorityTasksCount: 3,
    newLeadsCount: 5,
    newLeadsPeriod: 'yesterday' as const,
    dealClosingRateTrend: 15,
    dealsTrendPeriod: 'this_week' as const,
    appointmentsToday: 2,
    overdueTasksCount: 1,
  },
};

const insightsData = {
  insights: [
    {
      id: 'ins-1',
      type: 'warning' as const,
      source: 'heuristic' as const,
      title: 'Deal at Risk: Acme Corp',
      description: 'No contact in 15 days.',
      suggestedAction: 'Schedule follow-up',
      entityType: 'opportunity',
      entityId: 'opp-1',
      actionUrl: '/deals/opp-1',
      priority: 'high' as const,
      createdAt: '2026-02-09T08:00:00Z',
    },
  ],
  lastRefreshed: '2026-02-09T10:00:00Z',
};

const feedItems = [
  {
    id: 'feed-1',
    source: 'LEAD_ACTIVITY',
    type: 'ASSIGNMENT',
    title: 'New Lead Created',
    description: 'Lead #123 was added',
    timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
    actor: { id: 'u1', name: 'Bob Oliver', avatarUrl: null },
    entity: { id: '123', type: 'LEAD', name: 'Lead #123' },
    metadata: null,
  },
];

const goalData = {
  goal: {
    id: 'daily-revenue',
    type: 'revenue' as const,
    label: 'Sales',
    targetValue: 5000,
    currentValue: 2500,
    unit: '$',
    progress: 50,
    remainingToTarget: 2500,
    remainingFormatted: '$2,500',
  },
  lastUpdated: '2026-02-09T10:00:00Z',
};

const pinnedData = {
  items: [
    {
      id: 'pin-1',
      entityType: 'lead' as const,
      entityId: 'lead-1',
      title: 'Acme Corp Lead',
      subtitle: 'High priority',
      icon: null,
      url: '/leads/lead-1',
      pinnedAt: '2026-01-15T00:00:00Z',
      position: 0,
    },
    {
      id: 'pin-2',
      entityType: 'contact' as const,
      entityId: 'contact-1',
      title: 'Jane Doe Contact',
      subtitle: null,
      icon: null,
      url: '/contacts/contact-1',
      pinnedAt: '2026-01-16T00:00:00Z',
      position: 1,
    },
  ],
  maxItems: 10,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function resetQueryMocks() {
  mockWelcomeQuery.mockReturnValue({
    data: welcomeData,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockInsightsQuery.mockReturnValue({
    data: insightsData,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockUseActivityFeed.mockReturnValue({
    items: feedItems,
    isLoading: false,
    isError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });
  mockGoalQuery.mockReturnValue({
    data: goalData,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockPinnedQuery.mockReturnValue({
    data: pinnedData,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

import { AuthenticatedHomePage } from '../AuthenticatedHomePage';
// PERF-05: preload the lazy pinned-section module so its wiring renders within
// RTL's act() flush for these synchronous assertions (test-only; production still
// defers @dnd-kit into the dynamic chunk). See AuthenticatedHomePage.test.tsx.
import '../PinnedItemsDndRegion';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthenticatedHomePage Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryMocks();
    capturedDndProps = {};
    capturedOnUnpin = undefined;
    capturedOnItemClick = undefined;
  });

  // =========================================================================
  // Welcome Banner
  // =========================================================================

  it('tracks "View Schedule" CTA click', () => {
    render(<AuthenticatedHomePage />);
    const link = screen.getByRole('link', { name: /View Schedule/i });
    fireEvent.click(link);
    expect(mockTrackWelcomeCtaClick).toHaveBeenCalledWith('View Schedule', '/calendar');
  });

  it('tracks "Go to Dashboard" CTA click', () => {
    render(<AuthenticatedHomePage />);
    const link = screen.getByRole('link', { name: /Go to Dashboard/i });
    fireEvent.click(link);
    expect(mockTrackWelcomeCtaClick).toHaveBeenCalledWith('Go to Dashboard', '/dashboard');
  });

  // =========================================================================
  // AI Insights
  // =========================================================================

  it('tracks "View All" click in insights section', () => {
    render(<AuthenticatedHomePage />);
    const viewAllLinks = screen.getAllByRole('link', { name: /View All/i });
    const insightsLink = viewAllLinks.find(
      (l) => l.getAttribute('href') === '/agent-approvals/insights'
    );
    expect(insightsLink).toBeDefined();
    fireEvent.click(insightsLink!);
    expect(mockTrackInsightsViewAllClick).toHaveBeenCalled();
  });

  // =========================================================================
  // Activity Feed
  // =========================================================================

  it('tracks feed filter change', () => {
    render(<AuthenticatedHomePage />);
    // Open filter menu
    const filterBtn = screen.getByLabelText('Filter activity feed');
    fireEvent.click(filterBtn);
    // Click a filter option
    const callOption = screen.getByTestId('filter-option-CALL');
    fireEvent.click(callOption);
    expect(mockTrackFeedFilterChange).toHaveBeenCalledWith('CALL', 'all');
  });

  it('tracks "View All" click in feed section', () => {
    render(<AuthenticatedHomePage />);
    const viewAllLinks = screen.getAllByRole('link', { name: /View All/i });
    const feedLink = viewAllLinks.find((l) => l.getAttribute('href') === '/activity');
    expect(feedLink).toBeDefined();
    fireEvent.click(feedLink!);
    expect(mockTrackFeedViewAllClick).toHaveBeenCalled();
  });

  // =========================================================================
  // Goal Settings
  // =========================================================================

  it('tracks goal settings opened', () => {
    render(<AuthenticatedHomePage />);
    const settingsBtn = screen.getByLabelText(/Goal settings/i);
    fireEvent.click(settingsBtn);
    expect(mockTrackGoalSettingsOpened).toHaveBeenCalled();
  });

  // =========================================================================
  // Pinned Items
  // =========================================================================

  it('tracks pinned item click via callback', () => {
    render(<AuthenticatedHomePage />);
    // The mock DraggablePinnedItem captures onItemClick
    expect(capturedOnItemClick).toBeDefined();
    capturedOnItemClick!('lead', 'lead-1');
    expect(mockTrackPinnedItemClick).toHaveBeenCalledWith('lead', 'lead-1');
  });

  it('tracks unpin via callback', () => {
    render(<AuthenticatedHomePage />);
    expect(capturedOnUnpin).toBeDefined();
    capturedOnUnpin!('lead', 'lead-1');
    expect(mockTrackPinnedItemUnpin).toHaveBeenCalledWith('lead');
  });

  it('tracks pinned nav settings opened', () => {
    render(<AuthenticatedHomePage />);
    const editBtn = screen.getByLabelText(/Edit pinned/i);
    fireEvent.click(editBtn);
    expect(mockTrackPinnedNavSettingsOpened).toHaveBeenCalled();
  });

  it('tracks pinned items reorder on drag end', () => {
    render(<AuthenticatedHomePage />);
    const onDragEnd = capturedDndProps.onDragEnd as (event: any) => void;
    expect(onDragEnd).toBeDefined();
    // Simulate drag reorder
    onDragEnd({
      active: { id: 'lead-lead-1' },
      over: { id: 'contact-contact-1' },
    });
    expect(mockTrackPinnedItemsReorder).toHaveBeenCalledWith(2);
  });
});
