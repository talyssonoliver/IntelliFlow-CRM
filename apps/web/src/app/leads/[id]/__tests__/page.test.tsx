/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { toast } from '@intelliflow/ui';

const lane = vi.hoisted(() => ({
  // onSuccess handlers captured per mutation so cache-refresh behaviour can be asserted
  mutationOpts: {} as Record<
    string,
    {
      onSuccess?: (data?: unknown) => unknown;
      onError?: (err: { message: string }) => unknown;
      onSettled?: () => unknown;
    }
  >,
  user: { id: 'user-1', email: 'user@example.com' } as { id: string; email: string } | null,
  revalidateLeadCaches: vi.fn(),
  revalidateLeadConversionCaches: vi.fn(),
  pushRecentLeadView: vi.fn(),
}));

vi.mock('@/app/leads/actions', () => ({
  revalidateLeadCaches: lane.revalidateLeadCaches,
  revalidateLeadConversionCaches: lane.revalidateLeadConversionCaches,
}));
vi.mock('@/lib/leads/use-lead-recent-views', () => ({
  pushRecentLeadView: lane.pushRecentLeadView,
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockLogActivityMutate = vi.fn();
const mockAddNoteMutate = vi.fn();

// Mutable state refs so isPending tests can flip the flag without
// losing the implementation between Vitest's clearMocks resets.
const mockAddNoteState = { isPending: false };
const mockLogActivityState = { isPending: false };

// Captured mutation option callbacks — set by the useMutation mock factory so
// tests can invoke onSuccess/onError to exercise the component's callback paths.
const capturedCallbacks = {
  addNote: {
    onSuccess: null as (() => void) | null,
    onError: null as ((err: { message: string }) => void) | null,
  },
  logActivity: {
    onSuccess: null as (() => void) | null,
    onError: null as ((err: { message: string }) => void) | null,
  },
};

// Stable mock invalidators for asserting cache invalidation calls
const mockLeadGetByIdInvalidate = vi.fn();
const mockActivityFeedUnifiedInvalidate = vi.fn();
const mockActivityFeedEntityInvalidate = vi.fn();

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
    accountId: null as string | null,
    account: null as { id: string; name: string } | null,
    aiInsights: [] as unknown[],
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
    user: lane.user,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      lead: { getById: { invalidate: mockLeadGetByIdInvalidate } },
      activityFeed: {
        getUnifiedFeed: { invalidate: mockActivityFeedUnifiedInvalidate },
        getEntityFeed: { invalidate: mockActivityFeedEntityInvalidate },
      },
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
        useMutation: (opts?: { onSuccess?: (data?: unknown) => unknown }) => {
          lane.mutationOpts.delete = opts ?? {};
          return { mutate: vi.fn(), isPending: false };
        },
      },
      update: {
        useMutation: (opts?: { onSuccess?: (data?: unknown) => unknown }) => {
          lane.mutationOpts.archive = opts ?? {};
          return { mutate: vi.fn(), isPending: false };
        },
      },
      convert: {
        useMutation: (opts?: { onSuccess?: (data?: unknown) => unknown }) => {
          lane.mutationOpts.convert = opts ?? {};
          return { mutate: vi.fn(), isPending: false };
        },
      },
      scoreWithAI: {
        useMutation: (opts?: (typeof lane.mutationOpts)[string]) => {
          lane.mutationOpts.score = opts ?? {};
          return { mutate: vi.fn(), isPending: false };
        },
      },
      addNote: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => {
          lane.mutationOpts.addNote = opts ?? {};
          // Capture the component's onSuccess/onError callbacks so tests can invoke them
          if (opts?.onSuccess) capturedCallbacks.addNote.onSuccess = opts.onSuccess;
          if (opts?.onError) capturedCallbacks.addNote.onError = opts.onError;
          return {
            mutate: mockAddNoteMutate,
            isPending: mockAddNoteState.isPending,
          };
        },
      },
      logActivity: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => {
          lane.mutationOpts.logActivity = opts ?? {};
          if (opts?.onSuccess) capturedCallbacks.logActivity.onSuccess = opts.onSuccess;
          if (opts?.onError) capturedCallbacks.logActivity.onError = opts.onError;
          return {
            mutate: mockLogActivityMutate,
            isPending: mockLogActivityState.isPending,
          };
        },
      },
    },
    home: {
      getInsightById: {
        useQuery: () => ({ data: undefined }),
      },
      ensureInsightReview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      dismissInsight: {
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
  AlertDialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => <h2>{children}</h2>,
  Dialog: ({ children, open }: Readonly<{ children: React.ReactNode; open?: boolean }>) =>
    open !== false ? <div>{children}</div> : null,
  DialogContent: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogHeader: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogFooter: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => <h2>{children}</h2>,
  DialogDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => <p>{children}</p>,
  toast: vi.fn(),
  Tooltip: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  TooltipTrigger: ({ children }: Readonly<{ children: React.ReactNode; asChild?: boolean }>) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  TooltipProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
  EmptyState: ({
    entity,
    _phase,
    className,
    children,
    ctaHref,
    ctaLabel,
    showCta,
  }: Readonly<{
    entity?: string;
    _phase?: string;
    className?: string;
    children?: React.ReactNode;
    ctaHref?: string;
    ctaLabel?: string;
    showCta?: boolean;
  }>) => (
    <div data-testid={`empty-state-${entity}`} className={className}>
      {children || `No ${entity} yet`}
      {showCta !== false && ctaHref ? <a href={ctaHref}>{ctaLabel}</a> : null}
    </div>
  ),
}));

vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: () => null,
}));

vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: () => <button type="button">More Actions</button>,
}));

// PG-203 DSAR: the banner has its own tests and reads a router these mocks do not stub.
vi.mock('@/components/privacy/RestrictionBanner', () => ({ RestrictionBanner: () => null }));

vi.mock('@/components/home/PinButton', () => ({
  PinButton: () => <button type="button">Pin</button>,
}));

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name, src }: Readonly<{ name?: string; src?: string | null }>) => (
    <div data-testid="app-avatar" data-src={src ?? ''}>
      {name ?? 'Avatar'}
    </div>
  ),
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

describe('LeadDetailPage - Null AI Insight UX (IFC-226)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });

  it('does not render raw "Unknown" text anywhere on the page', () => {
    render(<Lead360Page />);
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  it('renders "Not analyzed" for engagement level in Lead IQ sidebar', () => {
    render(<Lead360Page />);
    const engagementBadge = screen.getByTestId('engagement-null-state');
    expect(engagementBadge).toHaveTextContent('Not analyzed');
  });

  it('renders engagement null-state with muted italic styling', () => {
    render(<Lead360Page />);
    const engagementBadge = screen.getByTestId('engagement-null-state');
    expect(engagementBadge.className).toContain('italic');
    expect(engagementBadge.className).toContain('text-slate-400');
  });

  it('renders "Not analyzed" for sentiment with muted styling (not green)', () => {
    render(<Lead360Page />);
    // Switch to AI Insights tab
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const sentimentBadge = screen.getByTestId('sentiment-null-state');
    expect(sentimentBadge).toHaveTextContent('Not analyzed');
    expect(sentimentBadge.className).not.toContain('bg-green-100');
    expect(sentimentBadge.className).toContain('italic');
  });

  it('renders "--" for conversion probability when aiInsight is null', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const conversionEl = screen.getByTestId('conversion-null-state');
    expect(conversionEl).toHaveTextContent('--');
  });

  it('renders "--" for estimated deal value when aiInsight is null', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const dealValueEl = screen.getByTestId('deal-value-null-state');
    expect(dealValueEl).toHaveTextContent('--');
  });

  it('renders "Not scored" for lead score when the lead was never scored', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const leadScoreEl = screen.getByTestId('lead-score-null-state');
    expect(leadScoreEl).toHaveTextContent('Not scored');
  });

  it('renders "Run AI Analysis" CTA in AI Insights tab', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    expect(screen.getByRole('button', { name: /Run AI Analysis/i })).toBeInTheDocument();
  });

  it('renders sidebar warning when aiInsight is null', () => {
    render(<Lead360Page />);
    expect(screen.getByText(/AI analysis not run yet/i)).toBeInTheDocument();
  });

  it('engagement bar uses null-state visual when aiInsight is null', () => {
    render(<Lead360Page />);
    const engagementBar = screen.getByTestId('engagement-bar-null-state');
    expect(engagementBar).toBeInTheDocument();
  });

  it('all null-state elements have data-testid attributes', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    expect(screen.getByTestId('engagement-null-state')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-null-state')).toBeInTheDocument();
    expect(screen.getByTestId('conversion-null-state')).toBeInTheDocument();
    expect(screen.getByTestId('deal-value-null-state')).toBeInTheDocument();
    expect(screen.getByTestId('lead-score-null-state')).toBeInTheDocument();
    expect(screen.getByTestId('engagement-bar-null-state')).toBeInTheDocument();
  });
});

describe('LeadDetailPage - Real AI Insight Rendering (IFC-226)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus = 'SCORED';
    mockLeadQueryState.data.aiInsights = [
      {
        engagementScore: 85,
        conversionProbability: 72,
        estimatedValue: 50000,
        churnRisk: 'LOW',
        sentiment: 'Positive',
        sentimentTrend: 'up',
        lastEngagementDays: 3,
        nextBestAction: 'Schedule follow-up',
        recommendations: ['Send proposal'],
        icpMatch: 'Strong',
      },
    ] as any;
  });

  afterEach(() => {
    mockLeadQueryState.data.aiInsights = [];
    delete (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus;
  });

  it('renders actual engagement level when aiInsight is populated', () => {
    render(<Lead360Page />);
    expect(screen.getByTestId('engagement-value')).toHaveTextContent('High');
  });

  it('renders sentiment with green styling when real data exists', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const sentimentBadge = screen.getByTestId('sentiment-value');
    expect(sentimentBadge).toHaveTextContent('Positive');
    expect(sentimentBadge.className).toContain('bg-green-100');
  });

  it('renders real conversion probability when aiInsight is populated', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const conversionEl = screen.getByTestId('conversion-value');
    expect(conversionEl).toHaveTextContent('72%');
  });
});

describe('LeadDetailPage - Empty State CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
  });

  it('renders empty state when activities array is empty (AC-001)', () => {
    // page.tsx:1278 renders `<EmptyState entity="activity" />`. This test
    // file locally stubs EmptyState (line 200-214) as a <div> rendering
    // `No {entity} yet` with `data-testid="empty-state-{entity}"`, so assert
    // on the stub contract rather than the canonical packages/ui copy.
    render(<Lead360Page />);
    expect(screen.getByTestId('empty-state-activity')).toBeInTheDocument();
  });

  // The "Log your first activity" CTA button was removed in the passive-phase
  // EmptyState migration: packages/ui/src/components/empty-state.tsx gates the
  // CTA behind `phase === 'soft-cta'` (empty-state.tsx:387), so a passive
  // EmptyState never renders the button. Its AC-001/AC-002 coverage moved
  // into AC-003's "activity-visible" path ÔÇö see below ÔÇö which is sufficient.

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
    expect(
      screen.queryByRole('button', { name: /Log your first activity/i })
    ).not.toBeInTheDocument();
  });

  it('renders LeadStatusBadge with "Negotiating" label for NEGOTIATING status (AC-005, AC-006)', () => {
    mockLeadQueryState.data.status = 'NEGOTIATING';
    render(<Lead360Page />);
    const negotiatingElements = screen.getAllByText('Negotiating');
    expect(negotiatingElements.length).toBeGreaterThan(0);
    // Reset for other tests
    mockLeadQueryState.data.status = 'NEW';
  });
});

describe('LeadDetailPage - Company-to-Account Link (IFC-227)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });

  afterEach(() => {
    mockLeadQueryState.data.accountId = null;
    mockLeadQueryState.data.account = null;
  });

  it('AC-001: lead with accountId renders profile card company as clickable Link to /accounts/acc-1', () => {
    mockLeadQueryState.data.accountId = 'acc-1';
    mockLeadQueryState.data.account = { id: 'acc-1', name: 'Acme Corp' };
    render(<Lead360Page />);
    const links = screen.getAllByRole('link', { name: /Acme Corp/i });
    const accountLink = links.find((l) => l.getAttribute('href') === '/accounts/acc-1');
    expect(accountLink).toBeDefined();
  });

  it('AC-002: lead with accountId renders info panel company as clickable Link to /accounts/acc-1', () => {
    mockLeadQueryState.data.accountId = 'acc-1';
    mockLeadQueryState.data.account = { id: 'acc-1', name: 'Acme Corp' };
    render(<Lead360Page />);
    const links = screen.getAllByRole('link', { name: /Acme Corp/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    const accountLinks = links.filter((l) => l.getAttribute('href') === '/accounts/acc-1');
    expect(accountLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('AC-003: lead with no accountId renders profile card company as plain span (no link)', () => {
    mockLeadQueryState.data.accountId = null;
    mockLeadQueryState.data.account = null;
    render(<Lead360Page />);
    const companyLinks = screen
      .queryAllByRole('link', { name: /Acme Corp/i })
      .filter((l) => l.getAttribute('href')?.startsWith('/accounts/'));
    expect(companyLinks).toHaveLength(0);
  });
});

// ─── IFC-247: Tab Navigation ───────────────────────────────────────────────

describe('LeadDetailPage - Tab Navigation (IFC-247)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });
  afterEach(() => {
    mockAddNoteState.isPending = false;
    mockLogActivityState.isPending = false;
  });

  it('AC-01: renders all 7 tab labels', () => {
    render(<Lead360Page />);
    // Tab labels use /^Label/i to match both badge-less ("Overview") and badge-present ("Activity 0")
    expect(screen.getByRole('button', { name: /^Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Activity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Emails/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Files/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^AI Insights/i })).toBeInTheDocument();
  });

  it('AC-01: Overview tab is active by default (shows overview content)', () => {
    render(<Lead360Page />);
    // Overview tab is the default — quick activity overview section is present
    // when no activities exist it shows an empty-state-activity element
    expect(screen.getByTestId('empty-state-activity')).toBeInTheDocument();
  });

  it('AC-02: clicking Activity tab switches to activity view (timeline + filter bar)', () => {
    render(<Lead360Page />);
    // Tab button accessible name includes count badge text; use /Activity/ to match both "Activity" and "Activity0"
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    // Activity tab renders the toggle bar with "Timeline" and "All Sources" buttons
    expect(screen.getByRole('button', { name: /Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All Sources/i })).toBeInTheDocument();
  });

  it('AC-14: clicking Tasks tab renders RelatedTasksCard stub', () => {
    render(<Lead360Page />);
    // Tab button accessible name may include count; use /^Tasks/ to match "Tasks" or "Tasks0"
    fireEvent.click(screen.getByRole('button', { name: /^Tasks/i }));
    // "Related Tasks" appears in both Overview quick-preview and Tasks tab content.
    // After switching to Tasks, Overview panel is gone so only Tasks panel renders it.
    // Use getAllByText and verify at least one element is present.
    expect(screen.getAllByText('Related Tasks').length).toBeGreaterThanOrEqual(1);
  });

  it('AC-12: clicking Emails tab shows email empty-state', () => {
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Emails/i }));
    expect(screen.getByTestId('empty-state-emails')).toBeInTheDocument();
  });

  it('the empty Emails tab composes to the lead, never to a blank recipient', () => {
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Emails/i }));
    const empty = screen.getByTestId('empty-state-emails');
    expect(within(empty).getByRole('link', { name: 'Compose email' })).toHaveAttribute(
      'href',
      '/email/compose?to=john%40example.com'
    );
  });
});

// ─── IFC-247: Notes Tab + addNote mutation ────────────────────────────────

describe('LeadDetailPage - Notes Tab + addNote mutation (IFC-247)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });
  afterEach(() => {
    mockAddNoteState.isPending = false;
    mockLogActivityState.isPending = false;
  });

  it('AC-03: clicking Notes tab renders "Write a note..." textarea', () => {
    render(<Lead360Page />);
    // Notes tab count is 0 so its accessible name may be "Notes" (count=0 → no badge).
    // Use /^Notes/i to match either "Notes" or "Notes 0"
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    expect(screen.getByPlaceholderText('Write a note...')).toBeInTheDocument();
  });

  it('AC-04: typing content and clicking Add Note calls addNote.mutate with {leadId, content}', () => {
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    const textarea = screen.getByPlaceholderText('Write a note...');
    fireEvent.change(textarea, { target: { value: 'Test note content' } });
    // "Add Note" button accessible name includes icon text "add" + " Add Note"
    // Use getByText to target the text portion and click the button
    fireEvent.click(screen.getByRole('button', { name: /Add Note/i }));
    expect(mockAddNoteMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      content: 'Test note content',
    });
  });

  it('AC-05: Add Note button is disabled when addNote isPending', () => {
    mockAddNoteState.isPending = true;
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    const textarea = screen.getByPlaceholderText('Write a note...');
    fireEvent.change(textarea, { target: { value: 'Test note' } });
    // When isPending=true the button text shows "Adding..." (page.tsx:1486)
    // The button has a material-icon span before the text so use getByText to find the text node
    const addingText = screen.getByText('Adding...');
    expect(addingText.closest('button')).toBeDisabled();
  });

  it('AC-15: addNote onSuccess invokes activityFeed invalidators without throwing', () => {
    // This test exercises the actual onSuccess callback captured from the component's
    // useMutation config (page.tsx:2359-2365). If activityFeed invalidators were missing
    // from useUtils, calling capturedCallbacks.addNote.onSuccess() would throw.
    render(<Lead360Page />);
    // Render triggers useMutation which captures onSuccess in capturedCallbacks
    expect(capturedCallbacks.addNote.onSuccess).not.toBeNull();
    // Invoke the onSuccess callback — this is what runs after a successful addNote mutation
    capturedCallbacks.addNote.onSuccess!();
    // Verify activityFeed invalidators were called (page.tsx:2363-2364)
    expect(mockActivityFeedUnifiedInvalidate).toHaveBeenCalledTimes(1);
    expect(mockActivityFeedEntityInvalidate).toHaveBeenCalledTimes(1);
  });

  it('addNote onError: destructive toast fires when mutation fails', () => {
    // This test exercises the actual onError callback from the component's
    // useMutation config (page.tsx:2366-2368), which fires a destructive toast.
    render(<Lead360Page />);
    expect(capturedCallbacks.addNote.onError).not.toBeNull();
    // Invoke the onError callback with a simulated error
    capturedCallbacks.addNote.onError!({ message: 'Failed to add note' });
    // Assert the destructive toast was called with the expected args (page.tsx:2367)
    expect(toast).toHaveBeenCalledWith({
      title: 'Failed to add note',
      description: 'Failed to add note',
      variant: 'destructive',
    });
  });

  it('addNote onError path: mutate calls are tracked', () => {
    // We verify the Notes tab renders and mutate was called with correct args.
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    const textarea = screen.getByPlaceholderText('Write a note...');
    expect(textarea).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: 'Note that will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Note/i }));
    // Confirm mutate was called with correct args
    expect(mockAddNoteMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      content: 'Note that will fail',
    });
  });
});

// ─── IFC-247: logActivity mutation ───────────────────────────────────────

describe('LeadDetailPage - logActivity mutation (IFC-247)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });
  afterEach(() => {
    mockAddNoteState.isPending = false;
    mockLogActivityState.isPending = false;
  });

  // Helper to open the Log Call dialog: finds the header button by its visible text content
  // The header button (page.tsx:2101-2106) has an icon span "call" + text " Log Call",
  // making its accessible name "call Log Call". Use getByText to find the text node and
  // then click the parent button.
  function openLogCallDialog() {
    // Find all elements with "Log Call" text — the header button contains this text
    const logCallTextNodes = screen.getAllByText(/Log Call/i);
    // The header button's text node is inside a <button> (not disabled, in the page header)
    const headerBtn = logCallTextNodes
      .map((el) => el.closest('button'))
      .find((btn) => btn !== null && !btn.disabled) as HTMLElement;
    fireEvent.click(headerBtn);
  }

  it('AC-06: Log Call dialog submit calls logActivity.mutate with title and type CALL', () => {
    render(<Lead360Page />);
    openLogCallDialog();
    // Dialog input is now accessible
    const titleInput = screen.getByLabelText(/Call Title/i);
    fireEvent.change(titleInput, { target: { value: 'Discovery call' } });
    // Dialog submit button: contains "Log Call" text. Both header and dialog buttons contain
    // "Log Call" — pick by class (dialog button has no icon, header button has icon span).
    // Use getByLabelText to find the input first, then find the submit button near it.
    // The dialog's "Log Call" submit button has className containing "bg-[#2a78f6]" and
    // does NOT have class "shadow-sm shadow-blue-200" (that's the header button).
    // Simplest: get all buttons with "Log Call" text and pick the last one (dialog renders after header).
    const logCallBtns = screen.getAllByText(/Log Call/i, { selector: 'button' });
    // The dialog submit button is last in DOM order
    fireEvent.click(logCallBtns[logCallBtns.length - 1]);
    expect(mockLogActivityMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      type: 'CALL',
      title: 'Discovery call',
      description: undefined,
    });
  });

  it('Log Call submit button is disabled when logActivity isPending', () => {
    mockLogActivityState.isPending = true;
    render(<Lead360Page />);
    openLogCallDialog();
    const titleInput = screen.getByLabelText(/Call Title/i);
    fireEvent.change(titleInput, { target: { value: 'Test call' } });
    // When isPending=true the submit button shows "Saving..." (page.tsx:862) and is disabled
    const savingBtn = screen.getByText('Saving...');
    expect(savingBtn.closest('button')).toBeDisabled();
  });

  it('logActivity onError: destructive toast fires when logActivity mutation fails', () => {
    // This test exercises the actual onError callback captured from the component's
    // useMutation config (page.tsx:2381-2383), which fires a destructive toast.
    render(<Lead360Page />);
    expect(capturedCallbacks.logActivity.onError).not.toBeNull();
    // Invoke the onError callback — this is what runs when logActivity mutation fails
    capturedCallbacks.logActivity.onError!({ message: 'Log activity failed' });
    // Assert the destructive toast was called with the expected args (page.tsx:2382)
    expect(toast).toHaveBeenCalledWith({
      title: 'Failed to log activity',
      description: 'Log activity failed',
      variant: 'destructive',
    });
  });

  it('logActivity mutate call args tracked via dialog', () => {
    render(<Lead360Page />);
    openLogCallDialog();
    const titleInput = screen.getByLabelText(/Call Title/i);
    fireEvent.change(titleInput, { target: { value: 'Call that fails' } });
    const logCallBtns = screen.getAllByText(/Log Call/i, { selector: 'button' });
    fireEvent.click(logCallBtns[logCallBtns.length - 1]);
    // Confirm mutate was called with correct args
    expect(mockLogActivityMutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      type: 'CALL',
      title: 'Call that fails',
      description: undefined,
    });
  });
});

// ─── IFC-247: Error States ────────────────────────────────────────────────

describe('LeadDetailPage - Error States (IFC-247)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.data = {
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
      owner: { id: 'owner-1', name: 'Alex Owner', email: 'alex@example.com', avatarUrl: null },
      activities: [],
      notes: [],
      files: [],
      tasks: [],
      calendarEvents: [],
      opportunities: [],
      accountId: null,
      account: null,
      aiInsights: [] as unknown[],
    } as typeof mockLeadQueryState.data;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.error = null;
  });
  afterEach(() => {
    mockAddNoteState.isPending = false;
    mockLogActivityState.isPending = false;
    mockLeadQueryState.data = {
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
      owner: { id: 'owner-1', name: 'Alex Owner', email: 'alex@example.com', avatarUrl: null },
      activities: [],
      notes: [],
      files: [],
      tasks: [],
      calendarEvents: [],
      opportunities: [],
      accountId: null,
      account: null,
      aiInsights: [] as unknown[],
    } as typeof mockLeadQueryState.data;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.error = null;
  });

  it('AC-07: 404 error renders "Lead Not Found" heading', () => {
    mockLeadQueryState.error = { message: 'Not found', data: { code: 'NOT_FOUND' } };
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    expect(screen.getByRole('heading', { name: /Lead Not Found/i })).toBeInTheDocument();
  });

  it('AC-07: 404 error shows "Back to Leads" link', () => {
    mockLeadQueryState.error = { message: 'Not found', data: { code: 'NOT_FOUND' } };
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    const backLink = screen.getByRole('link', { name: /Back to Leads/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/leads');
  });

  it('AC-07: 404 error does not show retry button', () => {
    mockLeadQueryState.error = { message: 'Not found', data: { code: 'NOT_FOUND' } };
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
  });

  it('AC-08: 500 error renders "Something Went Wrong" heading', () => {
    mockLeadQueryState.error = { message: 'Server error', data: { code: 'INTERNAL_SERVER_ERROR' } };
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    expect(screen.getByRole('heading', { name: /Something Went Wrong/i })).toBeInTheDocument();
  });

  it('AC-08: 500 error shows retry button', () => {
    mockLeadQueryState.error = { message: 'Server error', data: { code: 'INTERNAL_SERVER_ERROR' } };
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('AC-09: isLoading=true renders loading skeleton, not error', () => {
    mockLeadQueryState.isLoading = true;
    mockLeadQueryState.data = null as unknown as typeof mockLeadQueryState.data;
    render(<Lead360Page />);
    // Loading skeleton renders — no error heading should appear
    expect(screen.queryByRole('heading', { name: /Lead Not Found/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Something Went Wrong/i })
    ).not.toBeInTheDocument();
  });
});

// ─── IFC-247: Activity Feed Toggle ────────────────────────────────────────

describe('LeadDetailPage - Activity Feed Toggle (IFC-247)', () => {
  const makeActivities = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `act-${i + 1}`,
      type: 'NOTE' as const,
      title: `Activity ${i + 1}`,
      description: `Description ${i + 1}`,
      timestamp: '2026-03-10T00:00:00.000Z',
      userName: 'Test User',
      metadata: {} as Record<string, unknown>,
      sentiment: null,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.aiInsights = [];
  });
  afterEach(() => {
    mockAddNoteState.isPending = false;
    mockLogActivityState.isPending = false;
    mockLeadQueryState.data.activities = [];
  });

  it('AC-10: renders Load more button when activities exceed visibleCount of 5', () => {
    mockLeadQueryState.data.activities = makeActivities(6);
    render(<Lead360Page />);
    // REQUIRED: switch to Activity tab before asserting on Load more button.
    // Tab accessible name includes count badge: "Activity 6" — use /^Activity/i
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    expect(screen.getByRole('button', { name: /Load more activities/i })).toBeInTheDocument();
  });

  it('AC-11: does not render Load more button when activities count is 4', () => {
    mockLeadQueryState.data.activities = makeActivities(4);
    render(<Lead360Page />);
    // Tab accessible name: "Activity 4" — use /^Activity/i
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    expect(screen.queryByRole('button', { name: /Load more activities/i })).not.toBeInTheDocument();
  });

  it('Load more button text shows remaining activity count', () => {
    mockLeadQueryState.data.activities = makeActivities(8);
    render(<Lead360Page />);
    // Tab accessible name: "Activity 8" — use /^Activity/i
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    // visibleCount starts at 5; 8 - 5 = 3 remaining
    expect(screen.getByRole('button', { name: /3 remaining/i })).toBeInTheDocument();
  });

  it('clicking Load more button renders additional activities', () => {
    mockLeadQueryState.data.activities = makeActivities(7);
    render(<Lead360Page />);
    // Tab accessible name: "Activity 7" — use /^Activity/i
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    const loadMoreBtn = screen.getByRole('button', { name: /Load more activities/i });
    fireEvent.click(loadMoreBtn);
    // After clicking load more (visibleCount goes from 5 → 10), all 7 are visible
    // so the load more button should disappear
    expect(screen.queryByRole('button', { name: /Load more activities/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Floating-promise handling: cache refreshes are returned from onSuccess and
// failures are reported rather than left unhandled.
// ---------------------------------------------------------------------------
describe('Lead360Page — cache refresh promises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    lane.user = { id: 'user-1', email: 'user@example.com' };
    lane.revalidateLeadCaches.mockReset().mockResolvedValue(undefined);
    lane.revalidateLeadConversionCaches.mockReset().mockResolvedValue(undefined);
    lane.pushRecentLeadView.mockReset();
    mockLeadGetByIdInvalidate.mockReset();
    mockActivityFeedUnifiedInvalidate.mockReset();
    mockActivityFeedEntityInvalidate.mockReset();
  });

  const deferred = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };

  it.each(['addNote', 'logActivity'])(
    '%s onSuccess returns the invalidations so the mutation waits for the refetch',
    async (key) => {
      render(<Lead360Page />);
      const gate = deferred();
      mockLeadGetByIdInvalidate.mockReturnValueOnce(gate.promise);
      const returned = lane.mutationOpts[key].onSuccess!();
      let settled = false;
      Promise.resolve(returned).then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      gate.release();
      await returned;
      expect(settled).toBe(true);
      expect(mockActivityFeedUnifiedInvalidate).toHaveBeenCalled();
      expect(mockActivityFeedEntityInvalidate).toHaveBeenCalled();
    }
  );

  it('archive onSuccess toasts first, then returns revalidation + invalidation', async () => {
    render(<Lead360Page />);
    const returned = lane.mutationOpts.archive.onSuccess!();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead archived' }));
    await returned;
    expect(lane.revalidateLeadCaches).toHaveBeenCalledWith('user-1');
    expect(mockLeadGetByIdInvalidate).toHaveBeenCalledWith({ id: 'lead-1' });
  });

  it('archive onSuccess skips revalidation without a user', async () => {
    lane.user = null;
    render(<Lead360Page />);
    await lane.mutationOpts.archive.onSuccess!();
    expect(lane.revalidateLeadCaches).not.toHaveBeenCalled();
    expect(mockLeadGetByIdInvalidate).toHaveBeenCalled();
  });

  it('score onSuccess toasts, and onSettled returns revalidation + invalidation', async () => {
    render(<Lead360Page />);
    lane.mutationOpts.score.onSuccess!();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI analysis complete' }));
    await lane.mutationOpts.score.onSettled!();
    expect(lane.revalidateLeadCaches).toHaveBeenCalledWith('user-1');
    expect(mockLeadGetByIdInvalidate).toHaveBeenCalledWith({ id: 'lead-1' });
  });

  it('a failed scoring also refetches the lead, which is now marked FAILED (#1218)', async () => {
    render(<Lead360Page />);
    lane.mutationOpts.score.onError!({ message: 'AI scoring gave no usable score' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI analysis failed' }));
    await lane.mutationOpts.score.onSettled!();
    expect(lane.revalidateLeadCaches).toHaveBeenCalledWith('user-1');
    expect(mockLeadGetByIdInvalidate).toHaveBeenCalledWith({ id: 'lead-1' });
  });

  it('score onSettled skips revalidation without a user', async () => {
    lane.user = null;
    render(<Lead360Page />);
    await lane.mutationOpts.score.onSettled!();
    expect(lane.revalidateLeadCaches).not.toHaveBeenCalled();
    expect(mockLeadGetByIdInvalidate).toHaveBeenCalled();
  });

  it('logs a failed cache revalidation without failing the mutation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('revalidate down');
    lane.revalidateLeadCaches.mockRejectedValue(failure);
    lane.revalidateLeadConversionCaches.mockRejectedValue(failure);
    render(<Lead360Page />);
    await lane.mutationOpts.archive.onSuccess!();
    await lane.mutationOpts.score.onSettled!();
    lane.mutationOpts.delete.onSuccess!();
    lane.mutationOpts.convert.onSuccess!({ contactId: 'c-1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith('Failed to revalidate lead caches:', failure);
    expect(mockPush).toHaveBeenCalledWith('/leads');
    expect(mockPush).toHaveBeenCalledWith('/contacts/c-1');
    consoleError.mockRestore();
  });

  it('records the recently viewed lead', async () => {
    render(<Lead360Page />);
    await vi.waitFor(() => expect(lane.pushRecentLeadView).toHaveBeenCalledWith('lead-1'));
  });

  it('logs when recording the recently viewed lead fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('storage full');
    lane.pushRecentLeadView.mockImplementation(() => {
      throw failure;
    });
    render(<Lead360Page />);
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to record recently viewed lead:', failure)
    );
    consoleError.mockRestore();
  });
});

describe('LeadDetailPage - display name fallback (UI-016)', () => {
  const original = {
    firstName: mockLeadQueryState.data.firstName,
    lastName: mockLeadQueryState.data.lastName,
    company: mockLeadQueryState.data.company,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });

  afterEach(() => {
    Object.assign(mockLeadQueryState.data, original);
  });

  function setName(parts: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  }) {
    Object.assign(mockLeadQueryState.data, parts);
  }

  it('titles a lead without a person name by its company, in the heading and every prompt', () => {
    setName({ firstName: null, lastName: null, company: 'Acme Corp' });
    render(<Lead360Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Acme Corp');
    expect(screen.getByText(/permanently delete Acme Corp\?/)).toBeInTheDocument();
    expect(screen.getByText(/archive Acme Corp\?/)).toBeInTheDocument();
    expect(screen.getByText(/Convert Acme Corp to a contact record\?/)).toBeInTheDocument();
  });

  it('falls back to the email when the lead has no name and no company', () => {
    setName({ firstName: null, lastName: null, company: null });
    render(<Lead360Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('john@example.com');
    expect(screen.getByText(/permanently delete john@example\.com\?/)).toBeInTheDocument();
    expect(screen.queryByText(/permanently delete\s+\?/)).not.toBeInTheDocument();
  });

  it('keeps the person name when there is one', () => {
    render(<Lead360Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('John Doe');
  });

  it('gives the icon-only header actions accessible names', () => {
    render(<Lead360Page />);
    expect(screen.getByRole('button', { name: 'Edit lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert lead' })).toBeInTheDocument();
  });
});

describe('LeadDetailPage - no stock photos (UI-018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });

  it('passes no image to the avatars of a lead and owner without photos', () => {
    render(<Lead360Page />);
    const avatars = screen.getAllByTestId('app-avatar');
    expect(avatars.length).toBeGreaterThan(0);
    for (const avatar of avatars) {
      expect(avatar.getAttribute('data-src')).toBe('');
    }
  });
});

describe('LeadDetailPage - honest score and analysis (UI-022/023/024)', () => {
  const analysis = {
    engagementScore: 85,
    conversionProbability: 72,
    estimatedValue: 50000,
    churnRisk: 'LOW',
    sentiment: 'Positive',
    sentimentTrend: 'up',
    lastEngagementDays: 3,
    nextBestAction: 'Schedule follow-up',
    recommendations: ['Send proposal'],
    icpMatch: 'Strong',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsights = [];
  });

  afterEach(() => {
    mockLeadQueryState.data.aiInsights = [];
    delete (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus;
  });

  function setScored() {
    (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus = 'SCORED';
  }

  it('shows no invented next steps or recommendations when the analysis has not run', () => {
    render(<Lead360Page />);
    expect(screen.queryByText('Schedule Discovery Call')).not.toBeInTheDocument();
    expect(screen.queryByText('Send Follow-up Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommended Next Steps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.queryByText('AI Recommendations')).not.toBeInTheDocument();
    expect(screen.queryByText('No AI recommendations available yet')).not.toBeInTheDocument();
  });

  it('does not render the empty Similar Leads card', () => {
    render(<Lead360Page />);
    expect(screen.queryByText('Similar Leads')).not.toBeInTheDocument();
  });

  it('shows a real score in the sidebar and the AI tab even before the analysis runs', () => {
    setScored();
    render(<Lead360Page />);
    expect(screen.getByTestId('sidebar-lead-score')).toHaveTextContent('75/100');
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByTestId('lead-score-value')).toHaveTextContent('75/100');
  });

  it('says "Not scored" in the sidebar for a lead that was never scored', () => {
    render(<Lead360Page />);
    expect(screen.getByTestId('sidebar-lead-score')).toHaveTextContent('Not scored');
  });

  it('lists the analysis next steps as text, not as buttons without a handler', () => {
    setScored();
    mockLeadQueryState.data.aiInsights = [analysis] as never;
    render(<Lead360Page />);
    const steps = screen.getByTestId('sidebar-next-steps');
    expect(steps).toHaveTextContent('Schedule follow-up');
    expect(steps).toHaveTextContent('Send proposal');
    expect(steps.querySelector('button')).toBeNull();
  });

  it('keeps the lead score rather than substituting the engagement score', () => {
    mockLeadQueryState.data.aiInsights = [analysis] as never;
    render(<Lead360Page />);
    expect(screen.getByTestId('sidebar-lead-score')).toHaveTextContent('Not scored');
    expect(screen.getByTestId('sidebar-lead-score')).not.toHaveTextContent('85');
  });

  it('says so when an analysis made no recommendations', () => {
    setScored();
    mockLeadQueryState.data.aiInsights = [
      {
        ...analysis,
        nextBestAction: null,
        recommendations: [],
      },
    ] as never;
    render(<Lead360Page />);
    expect(screen.queryByTestId('sidebar-next-steps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByText('This analysis made no recommendations.')).toBeInTheDocument();
  });

  it('shows no stored row as analysis for a lead the scoring job never ran on (#1286 review)', () => {
    // Opening a lead used to save a heuristic row; a never-scored lead's row is not shown.
    mockLeadQueryState.data.aiInsights = [analysis] as never;
    render(<Lead360Page />);
    expect(screen.queryByTestId('sidebar-next-steps')).not.toBeInTheDocument();
    expect(screen.getByText(/AI analysis not run yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByTestId('conversion-null-state')).toHaveTextContent('--');
    expect(screen.queryByText('Send proposal')).not.toBeInTheDocument();
  });
});

// ─── #1277 visual check: Lead IQ reads the stored insight ────────────────────

describe('LeadDetailPage - Lead IQ source (#1277 visual check)', () => {
  const data = () =>
    mockLeadQueryState.data as unknown as {
      score: number;
      scoringStatus?: string;
      aiInsights: unknown[];
    };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
  });

  afterEach(() => {
    data().aiInsights = [];
    data().score = 75;
    delete data().scoringStatus;
  });

  it('shows the stored analysis, not "not run", for an analyzed lead', () => {
    data().score = 28;
    data().scoringStatus = 'SCORED';
    data().aiInsights = [
      {
        id: 'insight-1',
        engagementScore: 28,
        conversionProbability: 22,
        estimatedValue: 0,
        churnRisk: 'MEDIUM',
        sentiment: 'NEUTRAL',
        sentimentTrend: 'stable',
        lastEngagementDays: 0,
        nextBestAction: 'Review lead',
        recommendations: ['Review lead'],
        icpMatch: 'Weak Match',
      },
    ];
    render(<Lead360Page />);

    expect(screen.queryByText(/AI analysis not run yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Not analyzed yet')).not.toBeInTheDocument();
    expect(screen.getByText('Weak Match')).toBeInTheDocument();
  });

  it('shows no placeholder values from the scoring job as findings (#1286 review)', () => {
    data().score = 28;
    data().scoringStatus = 'SCORED';
    data().aiInsights = [
      {
        id: 'insight-1',
        engagementScore: 28,
        conversionProbability: 22,
        estimatedValue: 0,
        churnRisk: 'MEDIUM',
        sentiment: 'NEUTRAL',
        sentimentTrend: 'stable',
        lastEngagementDays: 0,
        nextBestAction: 'Review lead',
        recommendations: ['Review lead'],
        icpMatch: 'Weak Match',
      },
    ];
    render(<Lead360Page />);

    // Activity tab: no "Sentiment is stable / Last engagement: 0 days ago" from constants.
    fireEvent.click(screen.getByRole('button', { name: /^Activity/i }));
    expect(screen.queryByText(/Last engagement:/)).not.toBeInTheDocument();

    // AI tab: a 0 estimate is not shown as "£0".
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByTestId('deal-value-null-state')).toHaveTextContent('--');
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
  });

  it("shows the lead's own value as the deal value, not the insight's derived one (#1286 review)", () => {
    data().scoringStatus = 'SCORED';
    (mockLeadQueryState.data as { estimatedValue?: number }).estimatedValue = 2_500_000;
    data().aiInsights = [
      {
        id: 'insight-2',
        engagementScore: 60,
        conversionProbability: 48,
        // What the scoring job writes for a £25k lead: pence multiplied by 100 again.
        estimatedValue: 250_000_000,
        churnRisk: 'LOW',
        sentiment: 'POSITIVE',
        sentimentTrend: null,
        lastEngagementDays: 0,
        nextBestAction: null,
        recommendations: [],
        icpMatch: 'Good Match',
      },
    ];
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByTestId('deal-value')).toHaveTextContent('£25k');
    delete (mockLeadQueryState.data as { estimatedValue?: number }).estimatedValue;
  });

  it('shows "--", not a score-derived estimate, when the lead has no value', () => {
    data().scoringStatus = 'SCORED';
    data().aiInsights = [
      {
        id: 'insight-3',
        engagementScore: 28,
        conversionProbability: 22,
        // score 28 x 100_000: invented by the scoring job when the lead has no value.
        estimatedValue: 2_800_000,
        churnRisk: 'MEDIUM',
        sentiment: 'NEUTRAL',
        sentimentTrend: null,
        lastEngagementDays: 0,
        nextBestAction: null,
        recommendations: [],
        icpMatch: 'Weak Match',
      },
    ];
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));
    expect(screen.getByTestId('deal-value-null-state')).toHaveTextContent('--');
    expect(screen.queryByText('£28k')).not.toBeInTheDocument();
  });

  it('says the analysis has not run only when there is no insight', () => {
    data().score = 28;
    data().scoringStatus = 'SCORED';
    data().aiInsights = [];
    render(<Lead360Page />);

    expect(screen.getByText(/AI analysis not run yet/i)).toBeInTheDocument();
  });
});

describe('LeadDetailPage - Lead IQ card (#1277)', () => {
  it('has no BETA badge', () => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    render(<Lead360Page />);
    expect(screen.getByText('Lead IQ')).toBeInTheDocument();
    expect(screen.queryByText('BETA')).not.toBeInTheDocument();
  });
});

describe('LeadDetailPage - object-shaped recommendations (#1277 review)', () => {
  afterEach(() => {
    (mockLeadQueryState.data as unknown as { aiInsights: unknown[] }).aiInsights = [];
    delete (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus;
  });

  it('renders the AI tab, with the texts, when recommendations are stored as an object', () => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    (mockLeadQueryState.data as { scoringStatus?: string }).scoringStatus = 'SCORED';
    (mockLeadQueryState.data as unknown as { aiInsights: unknown[] }).aiInsights = [
      {
        id: 'insight-1',
        engagementScore: 60,
        conversionProbability: 48,
        estimatedValue: 0,
        churnRisk: 'LOW',
        sentiment: 'POSITIVE',
        sentimentTrend: 'stable',
        lastEngagementDays: 2,
        nextBestAction: null,
        recommendations: {
          texts: ['Follow up this week'],
          emotions: ['joy'],
          keyPhrases: ['pricing'],
          primaryEmotion: 'joy',
        },
        icpMatch: 'Good Match',
      },
    ];
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));

    expect(screen.getAllByText('Follow up this week').length).toBeGreaterThan(0);
  });
});
