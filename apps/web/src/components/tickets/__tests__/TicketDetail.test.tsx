/**
 * TicketDetail Component Tests (PG-137)
 *
 * Tests for full ticket detail view with tabs, actions, and related data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TicketDetail } from '../TicketDetail';
import type { TicketDetailData } from '../types';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock EntityActionSheet and MoreActionsButton
vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: ({ children, open }: any) =>
    open ? <div data-testid="action-sheet">{children}</div> : null,
}));

vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: ({ onClick }: any) => (
    <button data-testid="more-actions" onClick={onClick}>
      More Actions
    </button>
  ),
}));

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: () => <div data-testid="app-avatar" />,
}));

vi.mock('../TicketAssignSidebar', () => ({
  TicketAssignSidebar: ({ open, onAssign, currentUserId }: any) =>
    open ? (
      <div data-testid="assign-sidebar">
        <button onClick={() => onAssign(currentUserId)}>Assign to me</button>
        <button onClick={() => onAssign('00000000-0000-4000-8000-000000000108')}>
          Assign teammate
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/shared/assign-sheet', () => ({
  AssignSheet: ({ open, onAssign, children }: any) =>
    open ? (
      <div data-testid="escalation-sheet">
        {children}
        <button onClick={() => onAssign('00000000-0000-4000-8000-000000000108')}>
          Escalate to manager
        </button>
      </div>
    ) : null,
}));

// Mock PinButton to avoid tRPC context requirement
vi.mock('@/components/home/PinButton', () => ({
  PinButton: () => <button data-testid="pin-button" aria-label="Pin" />,
}));

// Mock tRPC client — EntityHoverCard / useActivityFeed resolve real tRPC
// calls on import which hang without a QueryClientProvider in tests.
vi.mock('@/lib/trpc', () => {
  const noopQuery = () => ({
    data: undefined,
    isLoading: false,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  const noopInfinite = () => ({
    data: { pages: [], pageParams: [] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  const noopMutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  });
  const handler: ProxyHandler<any> = {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (prop === 'useQuery') return noopQuery;
      if (prop === 'useInfiniteQuery') return noopInfinite;
      if (prop === 'useMutation') return noopMutation;
      if (prop === 'useUtils') return () => ({ invalidate: vi.fn() });
      return new Proxy({}, handler);
    },
  };
  return { trpc: new Proxy({}, handler) };
});

// Mock activity-feed hook — uses tRPC useInfiniteQuery internally.
vi.mock('@/hooks/useActivityFeed', () => ({
  useActivityFeed: () => ({
    activities: [],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    error: null,
  }),
}));

// Mock activity-feed component wholesale — not under test here.
vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: () => <div data-testid="activity-feed" />,
}));

// Mock EntityHoverCard — wraps children with a hover behavior; render children
// directly in tests.
vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: any) => <>{children}</>,
}));

// Mock QuickLogComposer — internal form not under test here.
vi.mock('@/components/shared/quick-log-composer', () => ({
  QuickLogComposer: () => <div data-testid="quick-log-composer" />,
}));

// Mock useActivityDeepLink — reads URL state we don't exercise.
vi.mock('@/hooks/useActivityDeepLink', () => ({
  useActivityDeepLink: () => ({ deepLinkedActivityId: null, clearDeepLink: vi.fn() }),
  isDeepLinkedActivity: () => false,
}));

// Mock SLAIndicator
vi.mock('../SLAIndicator', () => ({
  SLAIndicator: ({ slaStatus }: any) => <div data-testid="sla-indicator">{slaStatus}</div>,
}));

// Mock EscalationAlert
vi.mock('../EscalationAlert', () => ({
  EscalationAlert: ({ slaStatus, onEscalate }: any) => {
    if (slaStatus === 'BREACHED') {
      return (
        <div data-testid="escalation-alert">
          <button onClick={onEscalate}>Escalate</button>
        </div>
      );
    }
    return null;
  },
}));

// Mock @intelliflow/ui components — Proxy catches unknown imports as passthrough wrappers.
vi.mock('@intelliflow/ui', () => {
  const Passthrough = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const explicit: Record<string, any> = {
    Card: ({ children, className }: any) => <div className={className}>{children}</div>,
    Button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    Skeleton: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Separator: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    HoverCard: ({ children, open }: any) => (open === false ? null : <div>{children}</div>),
    HoverCardTrigger: ({ children }: any) => <div>{children}</div>,
    HoverCardContent: ({ children }: any) => <div>{children}</div>,
    EmptyState: ({ title, description, children }: any) => (
      <div data-testid="empty-state">
        {title}
        {description}
        {children}
      </div>
    ),
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    DropdownMenuSeparator: () => <hr />,
    Tabs: ({ children }: any) => <div>{children}</div>,
    TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
    TabsTrigger: ({ children, value }: any) => (
      <button role="tab" data-value={value}>
        {children}
      </button>
    ),
    TabsContent: ({ children }: any) => <div>{children}</div>,
    cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
    toast: Object.assign(vi.fn(), {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    }),
    AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
    AlertDialogContent: ({ children }: any) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
    AlertDialogAction: ({ children, onClick, className }: any) => (
      <button onClick={onClick} className={className}>
        {children}
      </button>
    ),
  };
  return new Proxy(explicit, {
    get(target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      if (prop in target) return target[prop as string];
      if (prop === '__esModule') return true;
      // Critical: `then` must NOT be a function — otherwise `await import(...)`
      // treats the whole mock as a thenable and hangs forever because the
      // React component returned never calls resolve/reject.
      if (prop === 'then') return undefined;
      return Passthrough;
    },
  });
});

describe('TicketDetail', () => {
  const mockTicket = {
    id: 'ticket-001',
    ticketNumber: '1001',
    subject: 'Test Ticket Subject',
    description: 'Test ticket description',
    status: 'OPEN' as const,
    priority: 'HIGH' as const,
    category: 'TECHNICAL',
    channel: 'EMAIL',
    slaStatus: 'BREACHED' as const,
    slaTimeRemaining: -60,
    slaResponseDue: null,
    slaResolutionDue: null,
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '2 hours ago',
    updatedAt: '30 minutes ago',
    tags: ['urgent', 'bug'],
    type: 'Incident',
    customer: {
      id: 'customer-001',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      title: 'CTO',
      isVIP: true,
      totalTickets: 5,
    },
    account: {
      id: 'account-001',
      name: 'Acme Corp',
      industry: 'Technology',
      tier: 'Enterprise',
    },
    assigneeInfo: {
      name: 'Sarah Jenkins',
      title: 'Support Lead',
    },
    sla: {
      firstResponse: {
        target: 30,
        actual: 15,
        met: true,
      },
      resolution: {
        status: 'BREACHED' as const,
        target: 240,
        remaining: -60,
      },
    },
    activities: [
      {
        id: 'activity-001',
        type: 'customer_message' as const,
        author: { name: 'John Doe', role: 'customer' as const },
        content: 'I need help with this issue',
        timestamp: '2 hours ago',
      },
    ],
    attachments: [
      {
        id: 'file-001',
        name: 'screenshot.png',
        type: 'image',
        size: '2.3 MB',
        uploader: 'John Doe',
      },
    ],
    nextSteps: [
      {
        id: 'step-001',
        title: 'Review logs',
        completed: false,
        dueDate: 'Due in 2 hours',
      },
    ],
    relatedTickets: [
      {
        id: 'ticket-002',
        subject: 'Related issue',
        status: 'RESOLVED' as const,
        similarity: 85,
      },
    ],
    aiInsights: {
      escalationRisk: 'high' as const,
      predictedResolutionTime: '4 hours',
      suggestedSolutions: ['Check server logs', 'Restart service'],
      sentiment: 'negative' as const,
      similarResolvedTickets: 3,
    },
    firstResponseAt: null,
    resolvedAt: null,
  } satisfies TicketDetailData;

  const handlers = {
    onStatusChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onAssign: vi.fn(),
    onAddResponse: vi.fn(),
    onResolve: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ticket header with subject and status badge', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByText(mockTicket.subject)).toBeInTheDocument();
    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });

  it('renders customer card with contact info', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    // Customer name may appear in multiple places (card + activity author)
    expect(screen.getAllByText(mockTicket.customer.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(mockTicket.customer.email)).toBeInTheDocument();
  });

  it('renders assignee card', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByText(mockTicket.assigneeInfo!.name)).toBeInTheDocument();
  });

  it('renders SLA tracking card', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByText('SLA Tracking')).toBeInTheDocument();
    // "First Response" appears in both overview metrics and SLA sidebar
    expect(screen.getAllByText('First Response').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Pending instead of N/A when first response is not recorded yet', () => {
    const pendingResponseTicket = {
      ...mockTicket,
      firstResponseAt: null,
      sla: {
        ...mockTicket.sla,
        firstResponse: {
          ...mockTicket.sla.firstResponse,
          actual: null,
          met: false,
        },
      },
    };

    render(<TicketDetail ticket={pendingResponseTicket} isLoading={false} {...handlers} />);

    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('shows EscalationAlert for BREACHED tickets', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByTestId('escalation-alert')).toBeInTheDocument();
  });

  it('hides EscalationAlert for ON_TRACK tickets', () => {
    const onTrackTicket = {
      ...mockTicket,
      sla: {
        ...mockTicket.sla,
        resolution: { status: 'ON_TRACK' as const, target: 240, remaining: 120 },
      },
    };

    render(<TicketDetail ticket={onTrackTicket} isLoading={false} {...handlers} />);

    expect(screen.queryByTestId('escalation-alert')).not.toBeInTheDocument();
  });

  it('opens escalation sheet when escalate is clicked from SLA alert', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    // Escalation sheet should not be open initially
    expect(screen.queryByTestId('escalation-sheet')).not.toBeInTheDocument();

    // Click escalate on the SLA breach alert
    const escalationAlert = screen.getByTestId('escalation-alert');
    fireEvent.click(within(escalationAlert).getByRole('button', { name: /escalate/i }));

    // Escalation sheet should now be open
    expect(screen.getByTestId('escalation-sheet')).toBeInTheDocument();
  });

  it('uses current user id for reassign action', () => {
    const currentUserId = '00000000-0000-4000-8000-000000000107';

    render(
      <TicketDetail
        ticket={mockTicket}
        isLoading={false}
        currentUserId={currentUserId}
        {...handlers}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reassign/i }));
    expect(screen.getByTestId('assign-sidebar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /assign to me/i }));
    expect(handlers.onAssign).toHaveBeenCalledWith(currentUserId);
  });

  it('opens the same assignment sidebar from quick action assign', () => {
    render(
      <TicketDetail
        ticket={mockTicket}
        isLoading={false}
        currentUserId="00000000-0000-4000-8000-000000000107"
        {...handlers}
      />
    );

    const quickAssignButton = screen.getAllByRole('button').find((button) => {
      const label = button.textContent?.toLowerCase() ?? '';
      return label.includes('assign') && !label.includes('reassign');
    });

    expect(quickAssignButton).toBeTruthy();
    fireEvent.click(quickAssignButton!);
    expect(screen.getByTestId('assign-sidebar')).toBeInTheDocument();
  });

  it('assigns to a teammate from the sidebar', () => {
    render(
      <TicketDetail
        ticket={mockTicket}
        isLoading={false}
        currentUserId="00000000-0000-4000-8000-000000000107"
        {...handlers}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reassign/i }));
    fireEvent.click(screen.getByRole('button', { name: /assign teammate/i }));

    expect(handlers.onAssign).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000108');
  });

  it('renders all 5 tabs', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    // Activity tab text might appear with count badge, use getAllByText
    expect(screen.getAllByText(/Activity/i).length).toBeGreaterThanOrEqual(1);
    // Resolution appears in both tab and SLA tracking sidebar
    expect(screen.getAllByText('Resolution').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Attachments/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
  });

  it('shows description in overview', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    expect(screen.getByText(mockTicket.description!)).toBeInTheDocument();
  });

  it('renders Next Steps checklist', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    mockTicket.nextSteps.forEach((step) => {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    });
  });

  it('renders Related Tickets', () => {
    render(<TicketDetail ticket={mockTicket} isLoading={false} {...handlers} />);

    mockTicket.relatedTickets.forEach((related) => {
      expect(screen.getByText(`#${related.id}`)).toBeInTheDocument();
    });
  });
});
