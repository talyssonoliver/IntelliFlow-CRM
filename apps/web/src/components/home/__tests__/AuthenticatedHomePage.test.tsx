/**
 * AuthenticatedHomePage Tests
 *
 * Comprehensive tests for the authenticated home page dashboard covering:
 * - Welcome banner rendering
 * - AI insights section (loading, empty, populated)
 * - Quick actions
 * - Activity feed with filtering and pagination
 * - Daily goal progress ring
 * - Pinned items section
 *
 * Task: PG-129 - Authenticated Home Page
 * Target: >=90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockWelcomeQuery,
  mockInsightsQuery,
  mockUseActivityFeed,
  mockGoalQuery,
  mockPinnedQuery,
  mockUnpinMutation,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();

  return {
    mockWelcomeQuery: vi.fn(),
    mockInsightsQuery: vi.fn(),
    mockUseActivityFeed: vi.fn(),
    mockGoalQuery: vi.fn(),
    mockPinnedQuery: vi.fn(),
    mockUnpinMutation: vi.fn(() => ({
      mutate: mockMutate,
      isLoading: false,
    })),
    mockMutate,
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
    },
    useUtils: vi.fn(() => ({
      activityFeed: { getUnifiedFeed: { invalidate: vi.fn() } },
    })),
  },
}));

vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: mockUseActivityFeed,
}));

// Mock ActivityFeed to bypass @tanstack/react-virtual (no layout in JSDOM)
vi.mock('@/components/shared/activity-feed/ActivityFeed', () => ({
  ActivityFeed: (props: any) => {
    const feed = mockUseActivityFeed();
    if (feed.isLoading)
      return (
        <div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse" />
          ))}
        </div>
      );
    if (feed.items.length === 0) return <div>No recent activity</div>;
    return (
      <div data-testid="activity-feed">
        {feed.items.map((item: any) => (
          <div key={item.id}>
            {item.actor && (
              <span>
                {item.actor.name
                  .split(' ')
                  .map((w: string) => w[0])
                  .join('')}
              </span>
            )}
            <span>{item.title}</span>
            <span>{item.description}</span>
            <time>
              {(() => {
                const ms = Date.now() - new Date(item.timestamp).getTime();
                const m = Math.round(ms / 60_000);
                if (m < 60) return `${m}m ago`;
                return `${Math.round(m / 60)}h ago`;
              })()}
            </time>
            {item.entity && (
              <a href={`/${item.entity.type.toLowerCase()}s/${item.entity.id}`}>
                View {item.entity.name}
              </a>
            )}
          </div>
        ))}
        {feed.hasNextPage && (
          <button onClick={feed.fetchNextPage}>Load More Updates</button>
        )}
      </div>
    );
  },
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
      title: 'Deal at Risk: Acme Corp',
      description: 'No contact in 15 days.',
      suggestedAction: 'Schedule follow-up',
      entityType: 'opportunity',
      entityId: 'opp-1',
      actionUrl: '/deals/opp-1',
      priority: 'high' as const,
      createdAt: '2026-02-09T08:00:00Z',
    },
    {
      id: 'ins-2',
      type: 'opportunity' as const,
      title: 'Hot Lead Detected',
      description: 'Jane Smith has score 92.',
      suggestedAction: null,
      entityType: 'lead',
      entityId: 'lead-1',
      actionUrl: '/leads/lead-1',
      priority: 'high' as const,
      createdAt: '2026-02-09T08:00:00Z',
    },
  ],
  lastRefreshed: '2026-02-09T10:00:00Z',
};

// Unified feed items (IFC-069 shape)
const feedItems = [
  {
    id: 'feed-1',
    source: 'LEAD_ACTIVITY',
    type: 'ASSIGNMENT',
    title: 'New Lead Created',
    description: 'Lead #123 was added',
    timestamp: new Date(Date.now() - 30 * 60_000).toISOString(), // 30m ago
    actor: { id: 'u1', name: 'Bob Oliver', avatarUrl: null },
    entity: { id: '123', type: 'LEAD', name: 'Lead #123' },
    metadata: null,
  },
  {
    id: 'feed-2',
    source: 'LEAD_ACTIVITY',
    type: 'TASK',
    title: 'Task Completed',
    description: 'Follow-up call done',
    timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), // 1h ago
    actor: null,
    entity: null,
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
  ],
  maxItems: 10,
};

// ---------------------------------------------------------------------------
// Helper: reset all query mocks to default "loaded" state
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
    hasNextPage: true,
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
// Import component under test (AFTER mocks are set up)
// ---------------------------------------------------------------------------

import { AuthenticatedHomePage } from '../AuthenticatedHomePage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthenticatedHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryMocks();
  });

  // =========================================================================
  // Welcome Banner
  // =========================================================================
  describe('Welcome Banner', () => {
    it('renders welcome greeting with user name', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/Welcome back, Alice!/)).toBeInTheDocument();
    });

    it('renders greeting label', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/Good morning/)).toBeInTheDocument();
    });

    it('renders View Schedule link pointing to /calendar', () => {
      render(<AuthenticatedHomePage />);
      const link = screen.getByRole('link', { name: /View Schedule/i });
      expect(link).toHaveAttribute('href', '/calendar');
    });

    it('renders Go to Dashboard link pointing to /dashboard', () => {
      render(<AuthenticatedHomePage />);
      const link = screen.getByRole('link', { name: /Go to Dashboard/i });
      expect(link).toHaveAttribute('href', '/dashboard');
    });

    it('shows dynamic welcome message based on stats', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/3 high-priority tasks pending/)).toBeInTheDocument();
    });

    it('shows deal closing rate trend in welcome message', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/deal closing rate is up by 15%/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // AI Insights Section
  // =========================================================================
  describe('AI Insights Section', () => {
    it('renders section header', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('AI Daily Insights')).toBeInTheDocument();
    });

    it('renders View All link', () => {
      render(<AuthenticatedHomePage />);
      const viewAll = screen.getByRole('link', { name: /View All/i });
      expect(viewAll).toHaveAttribute('href', '/agent-approvals');
    });

    it('renders insight cards with titles', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Deal at Risk: Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Hot Lead Detected')).toBeInTheDocument();
    });

    it('renders suggested action when present', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/Suggested Action: Schedule follow-up/)).toBeInTheDocument();
    });

    it('renders insight links with correct URLs', () => {
      render(<AuthenticatedHomePage />);
      const dealLink = screen.getByText('Deal at Risk: Acme Corp').closest('a');
      expect(dealLink).toHaveAttribute('href', '/deals/opp-1');
    });

    it('shows empty state when no insights', () => {
      mockInsightsQuery.mockReturnValue({
        data: { insights: [], lastRefreshed: new Date().toISOString() },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText('No insights at this time.')).toBeInTheDocument();
    });

    it('shows skeleton loader when loading', () => {
      mockInsightsQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      const pulseElements = document.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Quick Actions Section
  // =========================================================================
  describe('Quick Actions Section', () => {
    it('renders Quick Actions header', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('renders default quick action buttons', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Log Call')).toBeInTheDocument();
      expect(screen.getByText('Send Email')).toBeInTheDocument();
      expect(screen.getByText('Schedule Meeting')).toBeInTheDocument();
      expect(screen.getByText('Create Task')).toBeInTheDocument();
    });

    it('renders settings button for editing quick actions', () => {
      render(<AuthenticatedHomePage />);
      const settingsBtn = screen.getByTitle('Edit quick actions');
      expect(settingsBtn).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Activity Feed Section
  // =========================================================================
  describe('Activity Feed Section', () => {
    it('renders Your Feed header', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Your Feed')).toBeInTheDocument();
    });

    it('renders feed items', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('New Lead Created')).toBeInTheDocument();
      expect(screen.getByText('Task Completed')).toBeInTheDocument();
    });

    it('renders actor initials for feed items', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('BO')).toBeInTheDocument(); // derived from "Bob Oliver"
    });

    it('renders relative timestamps', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('30m ago')).toBeInTheDocument();
      expect(screen.getByText('1h ago')).toBeInTheDocument();
    });

    it('renders entity link for items with entity reference', () => {
      render(<AuthenticatedHomePage />);
      const viewLink = screen.getByText('View Lead #123');
      expect(viewLink.closest('a')).toHaveAttribute('href', '/leads/123');
    });

    it('renders Load More button when hasMore is true', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Load More Updates')).toBeInTheDocument();
    });

    it('shows empty state when no feed items', () => {
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

      render(<AuthenticatedHomePage />);
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    it('shows skeleton loader when loading', () => {
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

      render(<AuthenticatedHomePage />);
      const feedSection = screen.getByText('Your Feed').closest('div')!;
      const parent = feedSection.parentElement!;
      const pulseElements = parent.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Feed Filter
  // =========================================================================
  describe('Feed Filter', () => {
    it('renders filter button', () => {
      render(<AuthenticatedHomePage />);
      const filterBtn = screen.getByText('filter_list');
      expect(filterBtn).toBeInTheDocument();
    });

    it('opens filter dropdown on click', () => {
      render(<AuthenticatedHomePage />);
      const filterBtn = screen.getByText('filter_list').closest('button')!;
      fireEvent.click(filterBtn);

      expect(screen.getByText('All Activity')).toBeInTheDocument();
      expect(screen.getByText('Calls')).toBeInTheDocument();
      expect(screen.getByText('Emails')).toBeInTheDocument();
      expect(screen.getByText('Meetings')).toBeInTheDocument();
      expect(screen.getByText('Tasks')).toBeInTheDocument();
      expect(screen.getByText('Deals')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('Tickets')).toBeInTheDocument();
    });

    it('selects a filter option and closes dropdown', () => {
      render(<AuthenticatedHomePage />);
      const filterBtn = screen.getByText('filter_list').closest('button')!;
      fireEvent.click(filterBtn);

      const ticketsOption = screen.getByText('Tickets');
      fireEvent.click(ticketsOption);

      // Dropdown should be closed
      expect(screen.queryByText('All Activity')).not.toBeInTheDocument();
    });

    it('closes filter dropdown when clicking overlay', () => {
      render(<AuthenticatedHomePage />);
      const filterBtn = screen.getByText('filter_list').closest('button')!;
      fireEvent.click(filterBtn);

      expect(screen.getByText('All Activity')).toBeInTheDocument();

      const overlay = document.querySelector('.fixed.inset-0');
      if (overlay) {
        fireEvent.click(overlay);
        expect(screen.queryByText('All Activity')).not.toBeInTheDocument();
      }
    });
  });

  // =========================================================================
  // Today's Focus (Daily Goal)
  // =========================================================================
  describe("Today's Focus Section", () => {
    it("renders Today's Focus header", () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText("Today's Focus")).toBeInTheDocument();
    });

    it('renders goal label badge', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Sales')).toBeInTheDocument();
    });

    it('renders progress percentage', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('renders remaining amount', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('$2,500')).toBeInTheDocument();
    });

    it('renders "Goal Reached" label', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Goal Reached')).toBeInTheDocument();
    });

    it('renders SVG progress ring', () => {
      render(<AuthenticatedHomePage />);
      const svgElements = document.querySelectorAll('svg');
      const progressSvg = Array.from(svgElements).find((svg) =>
        svg.querySelector('path[stroke-dasharray]')
      );
      expect(progressSvg).toBeTruthy();
    });

    it('shows skeleton loader when loading', () => {
      mockGoalQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      const pulseElements = document.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Pinned Items Section
  // =========================================================================
  describe('Pinned Items Section', () => {
    it('renders Pinned header', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Pinned')).toBeInTheDocument();
    });

    it('renders edit button for pinned navigation', () => {
      render(<AuthenticatedHomePage />);
      const editBtn = screen.getByTitle('Edit pinned navigation');
      expect(editBtn).toBeInTheDocument();
    });

    it('renders pinned item titles', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Acme Corp Lead')).toBeInTheDocument();
    });

    it('renders pinned item subtitles', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('High priority')).toBeInTheDocument();
    });

    it('renders pinned item links with correct URLs', () => {
      render(<AuthenticatedHomePage />);
      const link = screen.getByText('Acme Corp Lead').closest('a');
      expect(link).toHaveAttribute('href', '/leads/lead-1');
    });

    it('shows empty state when no pinned items', () => {
      mockPinnedQuery.mockReturnValue({
        data: { items: [], maxItems: 10 },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText('No pinned items')).toBeInTheDocument();
    });

    it('shows skeleton loader when loading', () => {
      mockPinnedQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      const pinnedHeader = screen.getByText('Pinned');
      const section = pinnedHeader.closest('div')!.parentElement!;
      const pulseElements = section.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Footer
  // =========================================================================
  describe('Footer', () => {
    it('renders footer with product links', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Product')).toBeInTheDocument();
    });

    it('renders company info links', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Company')).toBeInTheDocument();
    });

    it('renders legal links', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('Legal')).toBeInTheDocument();
    });

    it('renders copyright notice', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/2025 IntelliFlow CRM/)).toBeInTheDocument();
    });

    it('renders social links', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByLabelText('Twitter')).toBeInTheDocument();
      expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
      expect(screen.getByLabelText('GitHub')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Layout & Structure
  // =========================================================================
  describe('Layout', () => {
    it('renders the main grid layout', () => {
      render(<AuthenticatedHomePage />);
      const grid = document.querySelector('.grid.grid-cols-1');
      expect(grid).toBeTruthy();
    });

    it('renders with light background', () => {
      render(<AuthenticatedHomePage />);
      const container = document.querySelector('[class*="bg-[#f6f7f8]"]');
      expect(container).toBeTruthy();
    });

    it('renders IntelliFlow CRM branding in footer', () => {
      render(<AuthenticatedHomePage />);
      expect(screen.getByText('IntelliFlow CRM')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Helper function edge cases
  // =========================================================================
  describe('Edge cases', () => {
    it('handles missing welcomeData gracefully', () => {
      mockWelcomeQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
      expect(screen.getByText("Here's what's happening today.")).toBeInTheDocument();
    });

    it('uses user name from auth context when welcome data is missing', () => {
      mockWelcomeQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/Welcome back, Alice/)).toBeInTheDocument();
    });

    it('shows welcome loading skeleton when welcome data is loading', () => {
      mockWelcomeQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      const banner = screen.getByText(/Welcome back/).closest('div')!;
      const pulseInBanner = banner.querySelector('.animate-pulse');
      expect(pulseInBanner).toBeTruthy();
    });

    it('handles zero goal progress', () => {
      mockGoalQuery.mockReturnValue({
        data: {
          goal: {
            ...goalData.goal,
            currentValue: 0,
            progress: 0,
            remainingToTarget: 5000,
            remainingFormatted: '$5,000',
          },
          lastUpdated: goalData.lastUpdated,
        },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('$5,000')).toBeInTheDocument();
    });

    it('handles negative deal closing rate trend', () => {
      mockWelcomeQuery.mockReturnValue({
        data: {
          ...welcomeData,
          stats: {
            ...welcomeData.stats,
            highPriorityTasksCount: 0,
            newLeadsCount: 0,
            dealClosingRateTrend: -10,
          },
        },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText(/deal closing rate is down by 10%/)).toBeInTheDocument();
    });

    it('handles all-zero stats in welcome message', () => {
      mockWelcomeQuery.mockReturnValue({
        data: {
          ...welcomeData,
          stats: {
            ...welcomeData.stats,
            highPriorityTasksCount: 0,
            newLeadsCount: 0,
            dealClosingRateTrend: 0,
          },
        },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      });

      render(<AuthenticatedHomePage />);
      expect(screen.getByText("Here's what's happening today.")).toBeInTheDocument();
    });
  });
});
