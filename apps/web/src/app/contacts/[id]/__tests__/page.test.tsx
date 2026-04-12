/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUseSearchParams = vi.fn(() => new URLSearchParams('tab=ai-insights'));
const mockUseActivityFeed = vi.fn(() => ({
  items: [] as Array<Record<string, unknown>>,
  isLoading: false,
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockEnsureInsightReviewMutate = vi.fn();
const mockLogActivityMutate = vi.fn();
const mockAddNoteMutate = vi.fn();
const mockScoreWithAIMutate = vi.fn();
let mockScoreWithAIIsPending = false;

const mockContactQueryState = {
  data: {
    id: 'contact-1',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '+1 555-0100',
    title: 'VP Sales',
    department: 'Revenue',
    status: 'ACTIVE',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    avatarUrl: null,
    account: {
      id: 'account-1',
      name: 'Acme Corp',
      industry: 'SaaS',
      website: 'https://acme.example.com',
    },
    owner: {
      id: 'owner-1',
      name: 'Alex Owner',
      email: 'alex@example.com',
      avatarUrl: null,
    },
    activities: [],
    notes: [],
    aiInsight: null,
    opportunities: [],
    tasks: [],
    documents: [],
    calendarEvents: [],
  },
  isLoading: false,
  error: null as { message?: string; data?: { code?: string } } | null,
};

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'contact-1' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'user@example.com' },
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      contact: { getById: { invalidate: vi.fn() } },
    }),
    contact: {
      getById: {
        useQuery: () => ({
          data: mockContactQueryState.data,
          isLoading: mockContactQueryState.isLoading,
          error: mockContactQueryState.error,
        }),
      },
      logActivity: {
        useMutation: () => ({
          mutate: mockLogActivityMutate,
          isPending: false,
        }),
      },
      addNote: {
        useMutation: () => ({
          mutate: mockAddNoteMutate,
          isPending: false,
        }),
      },
      scoreWithAI: {
        useMutation: () => ({
          mutate: mockScoreWithAIMutate,
          isPending: mockScoreWithAIIsPending,
        }),
      },
    },
    home: {
      getInsightById: {
        useQuery: () => ({
          data: undefined,
        }),
      },
      ensureInsightReview: {
        useMutation: () => ({
          mutate: mockEnsureInsightReviewMutate,
          isPending: false,
        }),
      },
      dismissInsight: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    className,
    disabled,
  }: Readonly<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({
    children,
    className,
  }: Readonly<{
    children: React.ReactNode;
    className?: string;
  }>) => <div className={className}>{children}</div>,
  Skeleton: ({ className }: Readonly<{ className?: string }>) => <div className={className} />,
  ChurnRiskCard: () => <div>Churn Risk Card</div>,
  NextBestActionCard: () => <div>Next Best Action Card</div>,
  toast: vi.fn(),
}));

vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: () => null,
}));

vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: () => <button type="button">More Actions</button>,
}));

vi.mock('@/components/home/PinButton', () => ({
  PinButton: () => <button type="button">Pin</button>,
}));

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name }: Readonly<{ name?: string }>) => <div>{name ?? 'Avatar'}</div>,
}));

vi.mock('@/components/tasks/RelatedTasksCard', () => ({
  RelatedTasksCard: () => <div>Related Tasks</div>,
}));

vi.mock('@/components/shared', () => ({
  UpcomingEventsCard: () => <div>Upcoming Events</div>,
}));

vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: () => <div>Activity Feed</div>,
  ActivityFeedItem: () => <div>Activity Feed Item</div>,
  ActivityFeedItemActions: () => <div>Activity Feed Item Actions</div>,
}));

vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: () => mockUseActivityFeed(),
}));

vi.mock('@/hooks/useActivityReactions', () => ({
  useActivityReactions: () => ({
    reactions: {},
    toggleReaction: vi.fn(),
  }),
}));

vi.mock('@/hooks/useActivityComments', () => ({
  useActivityComments: () => ({
    comments: {},
    addComment: vi.fn(),
    isAdding: false,
  }),
}));

vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/shared/quick-log-composer', () => ({
  QuickLogComposer: () => <div>Quick Log Composer</div>,
}));

vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (value: string | null | undefined) => value ?? null,
}));

import Contact360Page from '../page';

describe('Contact360Page - AI null state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=ai-insights'));
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
  });

  it('shows an honest pending AI state instead of fabricated fallback values', () => {
    render(<Contact360Page />);

    expect(screen.getByTestId('contact-ai-pending-banner')).toBeInTheDocument();
    expect(screen.getByTestId('contact-ai-pending-summary')).toBeInTheDocument();
    expect(screen.getAllByText('AI analysis has not been run for this contact yet.')).toHaveLength(
      2
    );
    expect(screen.getAllByRole('button', { name: 'Run AI Analysis' })).toHaveLength(2);

    expect(screen.queryByText('Conversion Probability')).not.toBeInTheDocument();
    expect(screen.queryByText('Engagement Score')).not.toBeInTheDocument();
    expect(screen.queryByText('No AI recommendations available yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });
});

describe('Contact360Page - Empty State CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    // Override to overview tab for CTA tests
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
  });

  it('renders "Log your first activity" button when recentUnifiedActivities is empty and not loading (AC-004)', () => {
    render(<Contact360Page />);
    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log your first activity/i })).toBeInTheDocument();
  });

  it('clicking CTA button switches to Activity tab (AC-005)', () => {
    render(<Contact360Page />);
    const ctaButton = screen.getByRole('button', { name: /Log your first activity/i });
    fireEvent.click(ctaButton);
    // After clicking, the Activity tab content should render (timeline view with search)
    expect(screen.getByPlaceholderText('Search activities...')).toBeInTheDocument();
  });

  it('CTA button is NOT rendered when recentUnifiedActivities has items (AC-006)', () => {
    mockUseActivityFeed.mockReturnValue({
      items: [
        {
          id: 'act-1',
          source: 'manual',
          type: 'NOTE',
          title: 'Test Activity',
          description: 'A test',
          timestamp: '2026-03-10T00:00:00.000Z',
          actor: { name: 'Test User' },
          entity: { type: 'contact', id: 'contact-1' },
          metadata: {},
        },
      ],
      isLoading: false,
    });
    render(<Contact360Page />);
    expect(
      screen.queryByRole('button', { name: /Log your first activity/i })
    ).not.toBeInTheDocument();
  });

  it('CTA button is NOT rendered while isUnifiedLoading is true (AC-007)', () => {
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: true });
    render(<Contact360Page />);
    expect(
      screen.queryByRole('button', { name: /Log your first activity/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Loading activity...')).toBeInTheDocument();
  });
});

describe('Contact360Page - scoreWithAI mutation (IFC-220)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockScoreWithAIIsPending = false;
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=ai-insights'));
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
  });

  it('T-001: clicking "Run AI Analysis" calls scoreWithAI.mutate with contactId', () => {
    render(<Contact360Page />);
    const buttons = screen.getAllByRole('button', { name: 'Run AI Analysis' });
    // Click the main tab button (first one is the banner in the tab content)
    fireEvent.click(buttons[0]);
    expect(mockScoreWithAIMutate).toHaveBeenCalledWith({ contactId: 'contact-1' });
  });

  it('T-002: button shows "Analyzing..." and is disabled when mutation is pending', () => {
    mockScoreWithAIIsPending = true;
    render(<Contact360Page />);
    const banner = screen.getByTestId('contact-ai-pending-banner');
    const button = banner.querySelector('button');
    expect(button).toHaveTextContent('Analyzing...');
    expect(button).toBeDisabled();
  });

  it('T-003: sidebar compact pending state uses onViewAiTab, not scoreWithAI', () => {
    render(<Contact360Page />);
    const summaryBanner = screen.getByTestId('contact-ai-pending-summary');
    const button = summaryBanner.querySelector('button');
    fireEvent.click(button!);
    // Sidebar button navigates to AI tab rather than triggering mutation
    expect(mockScoreWithAIMutate).not.toHaveBeenCalled();
  });

  it('T-004: pending banner has amber dashed border styling', () => {
    render(<Contact360Page />);
    const banner = screen.getByTestId('contact-ai-pending-banner');
    expect(banner.className).toContain('border-dashed');
    expect(banner.className).toContain('border-amber-300');
    expect(banner.className).toContain('bg-amber-50');
  });

  it('T-005: no pending banners shown when aiInsight data exists', () => {
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      aiInsight: {
        conversionProbability: 0.75,
        lifetimeValue: 50000,
        churnRisk: 'LOW',
        nextBestAction: 'Schedule follow-up',
        sentiment: 'POSITIVE',
        engagementScore: 85,
        recommendations: ['Follow up this week'],
        quietPeriodAlert: null,
        sentimentTrend: 'IMPROVING',
        lastEngagementDays: 3,
      } as any,
    };
    render(<Contact360Page />);
    expect(screen.queryByTestId('contact-ai-pending-banner')).not.toBeInTheDocument();
  });
});

describe('Contact360Page - Open Rate NaN fix (IFC-253 F-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
  });

  it('renders em dash for Open Rate when emailsSent is 0 (AC-001)', () => {
    // activities: [] → emailsSent = 0, emailsOpened = 0 → should show —
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      activities: [],
    };
    render(<Contact360Page />);

    // Should NOT render NaN anywhere
    const body = document.body.textContent || '';
    expect(body).not.toContain('NaN');

    // Should render em dash for Open Rate
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders correct percentage when emailsSent > 0 (AC-002)', () => {
    // 5 EMAIL activities → emailsSent = 5, emailsOpened is hardcoded to 0 → 0%
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      activities: [
        {
          id: 'a1',
          type: 'EMAIL',
          title: 'Email 1',
          description: '',
          createdAt: '2026-03-01T00:00:00Z',
          userId: 'u1',
          contactId: 'c1',
          metadata: null,
        },
        {
          id: 'a2',
          type: 'EMAIL',
          title: 'Email 2',
          description: '',
          createdAt: '2026-03-01T00:00:00Z',
          userId: 'u1',
          contactId: 'c1',
          metadata: null,
        },
        {
          id: 'a3',
          type: 'EMAIL',
          title: 'Email 3',
          description: '',
          createdAt: '2026-03-01T00:00:00Z',
          userId: 'u1',
          contactId: 'c1',
          metadata: null,
        },
        {
          id: 'a4',
          type: 'EMAIL',
          title: 'Email 4',
          description: '',
          createdAt: '2026-03-01T00:00:00Z',
          userId: 'u1',
          contactId: 'c1',
          metadata: null,
        },
        {
          id: 'a5',
          type: 'EMAIL',
          title: 'Email 5',
          description: '',
          createdAt: '2026-03-01T00:00:00Z',
          userId: 'u1',
          contactId: 'c1',
          metadata: null,
        },
      ] as any,
    };
    render(<Contact360Page />);

    // emailsOpened is hardcoded to 0, emailsSent = 5 → 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    // Should NOT render NaN anywhere
    const body = document.body.textContent || '';
    expect(body).not.toContain('NaN');
  });
});
