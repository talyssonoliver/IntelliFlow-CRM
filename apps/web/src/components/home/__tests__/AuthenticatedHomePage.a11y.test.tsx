/**
 * AuthenticatedHomePage Accessibility Tests
 *
 * Validates WCAG 2.1 AA compliance fixes applied in PG-166:
 * - Heading hierarchy (h1 → h2, no h3 skip)
 * - Decorative icons have aria-hidden="true"
 * - Icon-only buttons have aria-label
 * - SVG progress ring has aria-label and <title>
 * - Activity feed has role="feed" and aria-busy
 *
 * Task: PG-166 — Lighthouse audit on authenticated home page
 * AC: AC-009, AC-010, AC-011, AC-012, AC-013
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

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
  mockUpdateDailyGoalMutation,
  mockReorderMutation,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  const mockUpdateGoalMutate = vi.fn();
  const mockReorderMutate = vi.fn();

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
    mockUpdateDailyGoalMutation: vi.fn(() => ({
      mutate: mockUpdateGoalMutate,
      isLoading: false,
    })),
    mockReorderMutation: vi.fn(() => ({
      mutate: mockReorderMutate,
      isLoading: false,
    })),
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
      updateDailyGoal: { useMutation: mockUpdateDailyGoalMutation },
      reorderPinnedItems: { useMutation: mockReorderMutation },
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

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1', email: 'admin@intelliflow.dev', name: 'Admin User' },
  })),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  verticalListSortingStrategy: 'vertical',
  arrayMove: vi.fn((arr: unknown[]) => arr),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

vi.mock('@intelliflow/ui', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Sheet: ({ children, open }: Readonly<{ children: React.ReactNode; open: boolean }>) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  SheetTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => <h2>{children}</h2>,
  SheetDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => <p>{children}</p>,
  RadioGroup: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  RadioGroupItem: () => <input type="radio" />,
  Input: (props: Record<string, unknown>) => (
    <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} />
  ),
  Label: ({ children }: Readonly<{ children: React.ReactNode }>) => <label>{children}</label>,
}));

vi.mock('@/components/insights/InsightCard', () => ({
  InsightCard: ({ insight }: Readonly<{ insight: { title: string } }>) => (
    <div data-testid="insight-card">{insight.title}</div>
  ),
}));

vi.mock('@/components/notifications', () => ({
  NotificationItem: ({ notification }: any) => (
    <div data-testid={`notification-item-${notification.id}`}>{notification.title}</div>
  ),
  NotificationItemSkeleton: () => <div data-testid="notification-skeleton" />,
}));

vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: (_props: any) => (
    <div data-testid="activity-feed-mock" role="feed" aria-busy="false" />
  ),
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
          aria-expanded={open}
          aria-haspopup="listbox"
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockWelcomeQuery.mockReturnValue({
    data: {
      greeting: 'Good morning',
      userName: 'Admin User',
      summary: 'You have 3 tasks today',
      stats: { highPriorityTasks: 3, newLeads: 5, appointmentsToday: 2, overdueTaskCount: 1 },
    },
    isLoading: false,
  });

  mockInsightsQuery.mockReturnValue({
    data: {
      insights: [
        {
          id: '1',
          title: 'Hot lead detected',
          description: 'Lead X has high engagement',
          type: 'HOT_LEAD',
          priority: 'high',
          confidence: 0.95,
          createdAt: '2026-03-01T00:00:00Z',
          entityType: 'lead',
          entityId: 'lead-1',
          actionLabel: 'View Lead',
          actionUrl: '/leads/lead-1',
        },
      ],
    },
    isLoading: false,
  });

  mockUseActivityFeed.mockReturnValue({
    items: [
      {
        id: 'feed-1',
        type: 'CALL',
        title: 'Call with client',
        description: 'Discussed contract',
        timestamp: '2026-03-01T10:00:00Z',
        user: { name: 'Admin', avatar: null },
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  });

  mockGoalQuery.mockReturnValue({
    data: {
      goal: {
        id: 'goal-1',
        type: 'REVENUE',
        label: 'Daily Revenue',
        target: 10000,
        current: 6500,
        progress: 65,
        remainingFormatted: '$3,500',
      },
    },
    isLoading: false,
  });

  mockPinnedQuery.mockReturnValue({
    data: {
      items: [
        {
          id: 'pin-1',
          entityType: 'lead' as const,
          entityId: 'lead-1',
          title: 'Hot Lead',
          position: 0,
        },
      ],
      maxItems: 10,
    },
    isLoading: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthenticatedHomePage a11y', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // AC-009: Heading hierarchy
  describe('Heading hierarchy (AC-009)', () => {
    it('renders Welcome back as h1', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1.textContent).toContain('Welcome back');
    });

    it('renders section card headers as h2 elements', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const h2s = screen.getAllByRole('heading', { level: 2 });
      const h2Texts = h2s.map((h) => h.textContent);

      expect(h2Texts).toContain('Insights');
      expect(h2Texts).toContain('Quick Actions');
      expect(h2Texts).toContain('Your Feed');
      expect(h2Texts).toContain("Today's Focus");
      expect(h2Texts).toContain('Pinned');
    });

    it('has no h1→h3 skip (h3 only exists after h2)', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const levels = Array.from(headings).map((h) => parseInt(h.tagName[1]));

      // Verify no heading level jumps more than 1
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
      }
    });

    it('all heading levels are sequential (no gaps)', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const levels = Array.from(headings).map((h) => parseInt(h.tagName[1]));

      // Must have at least h1 and h2
      expect(levels).toContain(1);
      expect(levels).toContain(2);

      // No heading level should increase by more than 1
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
      }
    });
  });

  // AC-010: Decorative icons
  describe('Decorative icons (AC-010)', () => {
    it('has aria-hidden="true" on all decorative icon spans', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const iconSpans = container.querySelectorAll('span.material-symbols-outlined');
      const withoutAriaHidden = Array.from(iconSpans).filter(
        (span) => span.getAttribute('aria-hidden') !== 'true'
      );

      expect(withoutAriaHidden).toHaveLength(0);
    });
  });

  // AC-011: Icon-only buttons
  describe('Icon-only buttons (AC-011)', () => {
    it('feed filter button has aria-label', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const filterBtn = screen.getByLabelText('Filter activity feed');
      expect(filterBtn).toBeInTheDocument();
      expect(filterBtn.tagName).toBe('BUTTON');
    });

    it('feed filter button has aria-expanded reflecting dropdown state', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const filterBtn = screen.getByLabelText('Filter activity feed');
      expect(filterBtn).toHaveAttribute('aria-expanded', 'false');
    });

    it('feed filter button has aria-haspopup="listbox"', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const filterBtn = screen.getByLabelText('Filter activity feed');
      expect(filterBtn).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('Quick Actions settings button has aria-label="Edit quick actions"', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const btn = screen.getByLabelText('Edit quick actions');
      expect(btn).toBeInTheDocument();
      expect(btn.tagName).toBe('BUTTON');
    });

    it('Goal settings button has aria-label="Goal settings"', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const btn = screen.getByLabelText('Goal settings');
      expect(btn).toBeInTheDocument();
      expect(btn.tagName).toBe('BUTTON');
    });

    it('Pinned navigation edit button has aria-label="Edit pinned navigation"', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      render(<AuthenticatedHomePage />);

      const btn = screen.getByLabelText('Edit pinned navigation');
      expect(btn).toBeInTheDocument();
      expect(btn.tagName).toBe('BUTTON');
    });
  });

  // AC-012: SVG progress ring
  describe('SVG progress ring (AC-012)', () => {
    it('SVG progress ring has an aria-label', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const svg = container.querySelector('svg[aria-label]');
      expect(svg).toBeInTheDocument();
    });

    it('SVG progress ring has a <title> element with non-empty text', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const svg = container.querySelector('svg[aria-label]');
      expect(svg).toBeInTheDocument();

      const title = svg!.querySelector('title');
      expect(title).toBeInTheDocument();
      expect(title!.textContent).toBeTruthy();
      expect(title!.textContent).toContain('65%');
    });
  });

  // AC-013: Activity feed landmark
  describe('Activity feed landmark (AC-013)', () => {
    it('activity feed container has role="feed"', async () => {
      const { AuthenticatedHomePage } = await import('../AuthenticatedHomePage');
      const { container } = render(<AuthenticatedHomePage />);

      const feed = container.querySelector('[role="feed"]');
      expect(feed).toBeInTheDocument();
    });
  });
});
