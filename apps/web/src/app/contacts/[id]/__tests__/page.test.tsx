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
    tickets: [],
    ticketCount: 0,
    documentCount: 0,
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

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
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

vi.mock('@/components/shared/SuggestedTagsRow', () => ({
  SuggestedTagsRow: () => null,
}));

vi.mock('@/components/contacts/ReplyDraftsPanel', () => ({
  ReplyDraftsPanel: () => null,
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

// IFC-257: the Email/Log Call header actions and the map preview are extracted
// into their own components (unit-tested separately). Stub them here so the page
// render stays light (no EmailCompose/trpc graph) and existing blocks stay green.
vi.mock('@/components/contacts/ContactQuickActions', () => ({
  ContactQuickActions: ({
    contact,
    onLogCall,
    isLoggingCall,
  }: {
    contact: { id: string; email: string };
    onLogCall: (input: { contactId: string; type: 'CALL'; title: string }) => void;
    isLoggingCall: boolean;
  }) => (
    <div data-testid="contact-quick-actions" data-logging={String(isLoggingCall)}>
      <button
        type="button"
        onClick={() => onLogCall({ contactId: contact.id, type: 'CALL', title: 'Test call' })}
      >
        QA Log Call
      </button>
    </div>
  ),
}));

vi.mock('@/components/contacts/ContactMapPreview', () => ({
  ContactMapPreview: ({ location }: { location: string | null | undefined }) => (
    <div data-testid="contact-map-preview" data-location={location ?? ''} />
  ),
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

  it('renders canonical empty-state title when recentUnifiedActivities is empty (AC-004)', () => {
    // Source renders `<EmptyState entity="activity" phase="passive" />`
    // (page.tsx:2291). packages/ui's EmptyState hides its CTA button behind
    // `phase === 'soft-cta'` (empty-state.tsx:387), so the legacy 'Log your
    // first activity' button is never in the passive DOM. Assert the
    // canonical empty-state title instead.
    render(<Contact360Page />);
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  // Note: AC-005 (click CTA ÔåÆ switch to Activity tab) was deleted when the
  // CTA button was removed with the EmptyState migration. If the CTA returns,
  // add a fresh test targeting the new control.

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

  it('T-004b: compact pending state uses p-3 while full banner uses p-4', () => {
    render(<Contact360Page />);
    const banner = screen.getByTestId('contact-ai-pending-banner');
    const summaryBanner = screen.getByTestId('contact-ai-pending-summary');
    // Non-compact (full banner) should have p-4
    expect(banner.className).toContain('p-4');
    // Compact (sidebar summary) should have p-3 (tighter padding for sidebar)
    expect(summaryBanner.className).toContain('p-3');
    // Compact should NOT have p-4 at the container level
    expect(summaryBanner.className).not.toContain('p-4');
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
    // activities: [] ÔåÆ emailsSent = 0, emailsOpened = 0 ÔåÆ should show ÔÇö
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      activities: [],
    };
    render(<Contact360Page />);

    // Should NOT render NaN anywhere
    const body = document.body.textContent || '';
    expect(body).not.toContain('NaN');

    // Should render em dash for Open Rate
    expect(screen.getByText('ÔÇö')).toBeInTheDocument();
  });

  it('renders correct percentage when emailsSent > 0 (AC-002)', () => {
    // 5 EMAIL activities ÔåÆ emailsSent = 5, emailsOpened is hardcoded to 0 ÔåÆ 0%
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

    // emailsOpened is hardcoded to 0, emailsSent = 5 ÔåÆ 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    // Should NOT render NaN anywhere
    const body = document.body.textContent || '';
    expect(body).not.toContain('NaN');
  });
});

describe('Contact360Page - Company-to-Account Link (IFC-227)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
    mockContactQueryState.data.account = {
      id: 'account-1',
      name: 'Acme Corp',
      industry: 'SaaS',
      website: 'https://acme.example.com',
    };
  });

  afterEach(() => {
    mockContactQueryState.data.account = {
      id: 'account-1',
      name: 'Acme Corp',
      industry: 'SaaS',
      website: 'https://acme.example.com',
    };
  });

  it('AC-004: contact with linked account renders profile card company as Link to /accounts/account-1', () => {
    render(<Contact360Page />);
    const accountLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href') === '/accounts/account-1');
    expect(accountLinks.length).toBeGreaterThanOrEqual(1);
    expect(accountLinks[0]).toHaveTextContent(/Acme Corp/i);
  });

  it('AC-005: contact with no account renders plain company text with no /accounts/ href', () => {
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      account: null as any,
    };
    render(<Contact360Page />);
    const brokenLinks = screen
      .queryAllByRole('link')
      .filter((l) => (l.getAttribute('href') ?? '').includes('/accounts/'));
    expect(brokenLinks).toHaveLength(0);
  });

  it('AC-006: contact profile card company icon uses material-symbols-outlined, not inline SVG', () => {
    render(<Contact360Page />);
    // The profile card company link should contain a material symbol span, not an SVG
    const accountLink = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === '/accounts/account-1');
    expect(accountLink).toBeDefined();
    const svgInsideLink = accountLink!.querySelector('svg');
    expect(svgInsideLink).toBeNull();
    const materialSymbol = accountLink!.querySelector('.material-symbols-outlined');
    expect(materialSymbol).toBeDefined();
  });

  it('NF-003: contact with linked account but empty company string shows account name in link', () => {
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      account: {
        id: 'account-1',
        name: 'Acme Corp',
        industry: 'SaaS',
        website: null as unknown as string,
      },
    };
    render(<Contact360Page />);
    const accountLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href') === '/accounts/account-1');
    expect(accountLinks.length).toBeGreaterThanOrEqual(1);
    expect(accountLinks[0].textContent).not.toBe('');
  });
});

describe('Contact360Page - Tickets & Documents tabs (IFC-256)', () => {
  const sampleTicket = {
    id: 'tk-1',
    ticketNumber: 'T-00001',
    subject: 'Integration API question',
    status: 'RESOLVED',
    priority: 'MEDIUM',
    createdAt: '2025-01-10T09:00:00.000Z',
    resolvedAt: null,
  };
  const sampleDocument = {
    id: 'doc-1',
    name: 'Enterprise License Proposal',
    fileType: 'application/pdf',
    fileSize: 2_400_000,
    category: 'CONTRACT',
    createdAt: '2025-01-09T09:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockUseActivityFeed.mockReturnValue({ items: [], isLoading: false });
    // Reset the relational arrays this suite mutates
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      tickets: [],
      documents: [],
      ticketCount: 0,
      documentCount: 0,
    } as typeof mockContactQueryState.data;
  });

  afterEach(() => {
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      tickets: [],
      documents: [],
      ticketCount: 0,
      documentCount: 0,
    } as typeof mockContactQueryState.data;
  });

  // --- Tickets tab (F-02, F-21) ---

  it('Tickets tab renders real tickets from the API, not the hardcoded TKT-1234', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=tickets'));
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      tickets: [
        sampleTicket,
        {
          ...sampleTicket,
          id: 'tk-2',
          ticketNumber: 'T-00002',
          subject: 'Billing discrepancy',
          status: 'OPEN',
          priority: 'HIGH',
        },
      ],
    } as typeof mockContactQueryState.data;

    render(<Contact360Page />);

    const panel = screen.getByTestId('contact-tickets-tab');
    expect(panel).toHaveTextContent('Integration API question');
    expect(panel).toHaveTextContent('T-00001');
    // open ticket renders its humanised status/priority meta line
    expect(panel).toHaveTextContent('Billing discrepancy');
    expect(panel).toHaveTextContent('T-00002 • Open • High Priority');
    expect(screen.queryByText(/TKT-1234/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dec 15, 2024/)).not.toBeInTheDocument();
  });

  it('Tickets tab shows an empty state when the contact has no tickets', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=tickets'));

    render(<Contact360Page />);

    expect(screen.getByTestId('contact-tickets-empty')).toBeInTheDocument();
    expect(screen.queryByText(/TKT-1234/)).not.toBeInTheDocument();
  });

  it('Tickets tab badge shows the true total count (not the capped list length)', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=overview'));
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      // list is capped at 2 items but the contact actually has 24 tickets
      tickets: [sampleTicket, { ...sampleTicket, id: 'tk-2', ticketNumber: 'T-00002' }],
      ticketCount: 24,
    } as typeof mockContactQueryState.data;

    render(<Contact360Page />);

    const ticketsTab = screen.getByRole('button', { name: /Tickets/ });
    expect(ticketsTab).toHaveTextContent('24');
  });

  // --- Documents tab (F-03) ---

  it('Documents tab renders real documents from the API, not the hardcoded PDFs', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=documents'));
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      documents: [sampleDocument],
    } as typeof mockContactQueryState.data;

    render(<Contact360Page />);

    const panel = screen.getByTestId('contact-documents-tab');
    expect(panel).toHaveTextContent('Enterprise License Proposal');
    expect(screen.queryByText(/SOC2 Compliance Report\.pdf/)).not.toBeInTheDocument();
    // each document links to its detail page (where the signed download lives)
    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === `/documents/${sampleDocument.id}`);
    expect(link).toBeDefined();
  });

  it('Documents tab shows an empty state when the contact has no documents', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=documents'));

    render(<Contact360Page />);

    expect(screen.getByTestId('contact-documents-empty')).toBeInTheDocument();
    expect(screen.queryByText(/Enterprise License Proposal\.pdf/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SOC2 Compliance Report\.pdf/)).not.toBeInTheDocument();
  });

  it('Documents tab badge shows the true total count (not the capped list length)', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=overview'));
    mockContactQueryState.data = {
      ...mockContactQueryState.data,
      // list is capped at 1 item but the contact actually has 51 documents
      documents: [sampleDocument],
      documentCount: 51,
    } as typeof mockContactQueryState.data;

    render(<Contact360Page />);

    const documentsTab = screen.getByRole('button', { name: /Documents/ });
    expect(documentsTab).toHaveTextContent('51');
  });
});

describe('Contact360Page - IFC-257 action wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContactQueryState.error = null;
    mockContactQueryState.isLoading = false;
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('renders the extracted ContactQuickActions and ContactMapPreview', () => {
    render(<Contact360Page />);
    expect(screen.getByTestId('contact-quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('contact-map-preview')).toBeInTheDocument();
  });

  it('wires ContactQuickActions.onLogCall to the contact.logActivity mutation', () => {
    render(<Contact360Page />);
    fireEvent.click(screen.getByRole('button', { name: /QA Log Call/i }));
    expect(mockLogActivityMutate).toHaveBeenCalledWith({
      contactId: 'contact-1',
      type: 'CALL',
      title: 'Test call',
    });
  });

  it('passes the contact location through to ContactMapPreview', () => {
    render(<Contact360Page />);
    // location is hardcoded '' in the view-model until IFC-259 wires it from the API.
    expect(screen.getByTestId('contact-map-preview')).toHaveAttribute('data-location', '');
  });

  it('navigates to /deals/new with the contactId when "Add Deal" is clicked', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=deals'));
    render(<Contact360Page />);
    fireEvent.click(screen.getByRole('button', { name: /Add Deal/i }));
    expect(mockPush).toHaveBeenCalledWith('/deals/new?contactId=contact-1');
  });
});
