/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockEnsureInsightReviewMutate = vi.fn();
const mockLogActivityMutate = vi.fn();
const mockAddNoteMutate = vi.fn();

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
  useSearchParams: () => new URLSearchParams('tab=ai-insights'),
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
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    className,
  }: Readonly<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }>) => (
    <button type="button" onClick={onClick} className={className}>
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
  useActivityFeed: () => ({
    items: [],
    isLoading: false,
  }),
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
  });

  it('shows an honest pending AI state instead of fabricated fallback values', () => {
    render(<Contact360Page />);

    expect(screen.getByTestId('contact-ai-pending-banner')).toBeInTheDocument();
    expect(screen.getByTestId('contact-ai-pending-summary')).toBeInTheDocument();
    expect(screen.getAllByText('AI analysis has not been run for this contact yet.')).toHaveLength(
      2
    );
    expect(screen.getAllByRole('button', { name: 'View pending AI status' })).toHaveLength(2);

    expect(screen.queryByText('Conversion Probability')).not.toBeInTheDocument();
    expect(screen.queryByText('Engagement Score')).not.toBeInTheDocument();
    expect(screen.queryByText('No AI recommendations available yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });
});
