/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockLogActivityMutate = vi.fn();
const mockAddNoteMutate = vi.fn();

const mockLeadQueryState = {
  data: {
    id: 'lead-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 555-0101',
    company: 'Acme Corp',
    title: 'CTO',
    status: 'NEW',
    source: 'WEBSITE',
    score: 75,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    avatarUrl: null,
    owner: {
      id: 'owner-1',
      name: 'Alex Owner',
      email: 'alex@example.com',
      avatarUrl: null,
    },
    activities: [] as Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: string;
      userName: string;
      metadata: Record<string, unknown>;
      sentiment: string | null;
    }>,
    notes: [],
    files: [],
    tasks: [],
    calendarEvents: [],
    opportunities: [],
    account: null,
    aiInsight: null,
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
  useParams: () => ({ id: 'lead-1' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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
      lead: { getById: { invalidate: vi.fn() } },
    }),
    lead: {
      getById: {
        useQuery: () => ({
          data: mockLeadQueryState.data,
          isLoading: mockLeadQueryState.isLoading,
          error: mockLeadQueryState.error,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      convert: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      scoreWithAI: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      addNote: {
        useMutation: () => ({
          mutate: mockAddNoteMutate,
          isPending: false,
        }),
      },
      logActivity: {
        useMutation: () => ({
          mutate: mockLogActivityMutate,
          isPending: false,
        }),
      },
    },
    home: {
      getInsightById: {
        useQuery: () => ({ data: undefined }),
      },
      ensureInsightReview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    className,
    _variant,
    _size,
    disabled,
  }: Readonly<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    _variant?: string;
    _size?: string;
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
  AlertDialog: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  AlertDialogAction: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <button type="button">{children}</button>
  ),
  AlertDialogCancel: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <h2>{children}</h2>
  ),
  Dialog: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogFooter: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => <h2>{children}</h2>,
  DialogDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <p>{children}</p>
  ),
  toast: vi.fn(),
  Tooltip: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  TooltipTrigger: ({ children }: Readonly<{ children: React.ReactNode; asChild?: boolean }>) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  TooltipProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
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

import Lead360Page from '../page';

describe('LeadDetailPage - Empty State CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
  });

  it('renders "No activities yet" text when activities array is empty (AC-001)', () => {
    render(<Lead360Page />);
    expect(screen.getByText('No activities yet')).toBeInTheDocument();
  });

  it('renders "Log your first activity" button when activities array is empty (AC-001)', () => {
    render(<Lead360Page />);
    expect(screen.getByRole('button', { name: /Log your first activity/i })).toBeInTheDocument();
  });

  it('clicking CTA button switches to Activity tab (AC-002)', () => {
    render(<Lead360Page />);
    const ctaButton = screen.getByRole('button', { name: /Log your first activity/i });
    fireEvent.click(ctaButton);
    // After clicking, the Activity tab content should render (timeline view with search)
    expect(screen.getByPlaceholderText('Search activities...')).toBeInTheDocument();
  });

  it('CTA button is NOT rendered when activities array has items (AC-003)', () => {
    mockLeadQueryState.data.activities = [
      {
        id: 'act-1',
        type: 'NOTE',
        title: 'Test Activity',
        description: 'A test activity',
        timestamp: '2026-03-10T00:00:00.000Z',
        userName: 'Test User',
        metadata: {},
        sentiment: null,
      },
    ];
    render(<Lead360Page />);
    expect(screen.queryByRole('button', { name: /Log your first activity/i })).not.toBeInTheDocument();
  });
});
