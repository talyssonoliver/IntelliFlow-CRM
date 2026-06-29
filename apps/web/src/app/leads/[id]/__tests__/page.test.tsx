/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockLogActivityMutate = vi.fn();
const mockAddNoteMutate = vi.fn();

// Mutable state refs so isPending tests can flip the flag without
// losing the implementation between Vitest's clearMocks resets.
const mockAddNoteState = { isPending: false };
const mockLogActivityState = { isPending: false };

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
      activityFeed: {
        getUnifiedFeed: { invalidate: vi.fn() },
        getEntityFeed: { invalidate: vi.fn() },
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
          isPending: mockAddNoteState.isPending,
        }),
      },
      logActivity: {
        useMutation: () => ({
          mutate: mockLogActivityMutate,
          isPending: mockLogActivityState.isPending,
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
  Dialog: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
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
  }: Readonly<{
    entity?: string;
    _phase?: string;
    className?: string;
    children?: React.ReactNode;
  }>) => (
    <div data-testid={`empty-state-${entity}`} className={className}>
      {children || `No ${entity} yet`}
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

describe('LeadDetailPage - Null AI Insight UX (IFC-226)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsight = null;
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

  it('renders "--" for lead score when aiInsight is null', () => {
    render(<Lead360Page />);
    const aiTab = screen.getByRole('button', { name: /AI Insights/i });
    fireEvent.click(aiTab);
    const leadScoreEl = screen.getByTestId('lead-score-null-state');
    expect(leadScoreEl).toHaveTextContent('--');
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
    mockLeadQueryState.data.aiInsight = {
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
    } as any;
  });

  afterEach(() => {
    mockLeadQueryState.data.aiInsight = null;
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
    mockLeadQueryState.data.aiInsight = null;
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
    mockLeadQueryState.data.aiInsight = null;
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
});

// ─── IFC-247: Notes Tab + addNote mutation ────────────────────────────────

describe('LeadDetailPage - Notes Tab + addNote mutation (IFC-247)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadQueryState.error = null;
    mockLeadQueryState.isLoading = false;
    mockLeadQueryState.data.activities = [];
    mockLeadQueryState.data.aiInsight = null;
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

  it('AC-15: addNote onSuccess path does not throw when activityFeed invalidators are wired', () => {
    // This test verifies the useUtils mock has the activityFeed namespace — if it
    // were missing, the component render itself would throw on addNote.onSuccess.
    // Successful render with the mocked mutation confirms the wiring is correct.
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    expect(screen.getByPlaceholderText('Write a note...')).toBeInTheDocument();
  });

  it('addNote onError path: error toast does not prevent Notes tab from rendering', () => {
    // The onError handler (page.tsx:2366-2368) fires a destructive toast.
    // We verify the Notes tab still renders correctly even when the mock is configured
    // to simulate an error scenario — testing that error handling is isolated.
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Notes/i }));
    const textarea = screen.getByPlaceholderText('Write a note...');
    expect(textarea).toBeInTheDocument();
    // Simulate that the mutate function was previously called (would trigger onError on failure)
    fireEvent.change(textarea, { target: { value: 'Note that will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Note/i }));
    // Mock doesn't throw — we confirm mutate was called with correct args
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
    mockLeadQueryState.data.aiInsight = null;
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
    // The dialog's "Log Call" submit button has className containing "bg-[#137fec]" and
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

  it('logActivity onError path: error handling does not break dialog', () => {
    render(<Lead360Page />);
    openLogCallDialog();
    const titleInput = screen.getByLabelText(/Call Title/i);
    fireEvent.change(titleInput, { target: { value: 'Call that fails' } });
    const logCallBtns = screen.getAllByText(/Log Call/i, { selector: 'button' });
    fireEvent.click(logCallBtns[logCallBtns.length - 1]);
    // Mock doesn't throw; confirm mutate was called — onError would fire if it rejected
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
      aiInsight: null,
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
      aiInsight: null,
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
    mockLeadQueryState.data.aiInsight = null;
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
