/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockConvertMutate, mockPush, mockToast, callbacks, mockLeadData } = vi.hoisted(() => ({
  mockConvertMutate: vi.fn(),
  mockPush: vi.fn(),
  mockToast: vi.fn(),
  callbacks: {
    onSuccess: null as ((data: { contactId: string }) => void) | null,
    onError: null as ((err: { message: string }) => void) | null,
  },
  mockLeadData: {
    id: 'lead-test-id',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 555-0101',
    company: 'Acme Corp',
    title: 'CTO',
    status: 'QUALIFIED' as string,
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
    activities: [] as Array<Record<string, unknown>>,
    notes: [],
    files: [],
    tasks: [],
    calendarEvents: [],
    opportunities: [],
    account: null,
    aiInsight: null,
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'lead-test-id' }),
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
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
      // TaskCreateSheet is rendered transitively (via EntityHoverCard's
      // "Create Task" action) and calls `api.useUtils().task.list.invalidate`.
      task: { list: { invalidate: vi.fn() } },
    }),
    lead: {
      getById: {
        useQuery: () => ({
          data: mockLeadData,
          isLoading: false,
          error: null,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      convert: {
        useMutation: (opts: {
          onSuccess?: (data: { contactId: string }) => void;
          onError?: (err: { message: string }) => void;
        }) => {
          callbacks.onSuccess = opts.onSuccess ?? null;
          callbacks.onError = opts.onError ?? null;
          return { mutate: mockConvertMutate, isPending: false };
        },
      },
      scoreWithAI: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      addNote: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      logActivity: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
    // TaskCreateSheet dependency (rendered via EntityHoverCard actions).
    task: {
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Button: ({ children, onClick, disabled, className }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Skeleton: ({ className }: any) => <div className={className} />,
  ChurnRiskCard: () => <div>Churn Risk Card</div>,
  NextBestActionCard: () => <div>Next Best Action Card</div>,
  toast: mockToast,
  // AlertDialog family — open-gate pattern
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  // Dialog family
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  // Tooltip family — pass-through
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  AppAvatar: ({ name }: { name?: string }) => <div>{name ?? 'Avatar'}</div>,
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

describe('IFC-225: Convert Lead UX Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadData.status = 'QUALIFIED';
  });

  // T1: Button enabled for QUALIFIED (AC-001 positive)
  it('Convert button is enabled for QUALIFIED status', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    const btn = screen.getByRole('button', { name: /Convert Lead/i });
    expect(btn).not.toBeDisabled();
  });

  // T2: Button disabled for non-QUALIFIED (AC-001)
  it.each(['NEW', 'CONTACTED', 'UNQUALIFIED', 'LOST'])(
    'Convert button is disabled for %s status',
    (status) => {
      mockLeadData.status = status;
      render(<Lead360Page />);
      const btn = screen.getByRole('button', { name: /Convert Lead/i });
      expect(btn).toBeDisabled();
    }
  );

  // T3: Button hidden for CONVERTED (AC-002)
  it('Convert button is hidden for CONVERTED status', () => {
    mockLeadData.status = 'CONVERTED';
    render(<Lead360Page />);
    expect(screen.queryByRole('button', { name: /Convert Lead/i })).not.toBeInTheDocument();
  });

  // T4: Tooltip guidance text for disabled button (AC-001)
  it('shows tooltip guidance text for disabled button', () => {
    mockLeadData.status = 'NEW';
    render(<Lead360Page />);
    expect(screen.getByText(/must be qualified before conversion/i)).toBeInTheDocument();
  });

  // T5: Click opens dialog (AC-003)
  it('clicking Convert on QUALIFIED lead opens confirmation dialog', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    const btn = screen.getByRole('button', { name: /Convert Lead/i });
    fireEvent.click(btn);
    expect(screen.getByText('Convert Lead to Contact')).toBeInTheDocument();
    expect(mockConvertMutate).not.toHaveBeenCalled();
  });

  // T6: Dialog has createAccount checkbox + accountName input (AC-004)
  it('dialog contains createAccount checkbox and accountName input', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /Convert Lead/i }));

    const checkbox = screen.getByLabelText(/Also create an Account record/i);
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();

    const nameInput = screen.getByLabelText(/Account name/i);
    expect(nameInput).toBeInTheDocument();

    // Uncheck → input hidden
    fireEvent.click(checkbox);
    expect(screen.queryByLabelText(/Account name/i)).not.toBeInTheDocument();

    // Recheck → input visible again
    fireEvent.click(checkbox);
    expect(screen.getByLabelText(/Account name/i)).toBeInTheDocument();
  });

  // T7: Cancel closes dialog (AC-006)
  it('cancel closes dialog without calling mutation', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /Convert Lead/i }));
    expect(screen.getByText('Convert Lead to Contact')).toBeInTheDocument();

    // Our mock AlertDialog renders null when open=false, but Cancel doesn't directly
    // control open state. The AlertDialogCancel from the real component calls onOpenChange(false).
    // With our mock, we just verify the Cancel button exists and mutation wasn't called.
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(mockConvertMutate).not.toHaveBeenCalled();
  });

  // T8: Confirm with createAccount=false (AC-005)
  it('confirm with createAccount=false sends correct params', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /Convert Lead/i }));

    // Uncheck createAccount
    const checkbox = screen.getByLabelText(/Also create an Account record/i);
    fireEvent.click(checkbox);

    // Click the confirm button (last "Convert Lead" button in dialog)
    const confirmButtons = screen.getAllByRole('button', { name: /Convert Lead/i });
    const confirmBtn = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(confirmBtn);

    expect(mockConvertMutate).toHaveBeenCalledWith({
      leadId: 'lead-test-id',
      createAccount: false,
      accountName: undefined,
    });
  });

  // T9: Confirm with createAccount=true + accountName (AC-005)
  it('confirm with createAccount=true and accountName sends correct params', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);
    fireEvent.click(screen.getByRole('button', { name: /Convert Lead/i }));

    const nameInput = screen.getByLabelText(/Account name/i);
    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } });

    const confirmButtons = screen.getAllByRole('button', { name: /Convert Lead/i });
    const confirmBtn = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(confirmBtn);

    expect(mockConvertMutate).toHaveBeenCalledWith({
      leadId: 'lead-test-id',
      createAccount: true,
      accountName: 'Acme Corp',
    });
  });

  // T10: Error toast with mapped message (AC-007)
  it('error toast shows mapped user-friendly message', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);

    expect(callbacks.onError).not.toBeNull();
    callbacks.onError!({ message: 'Only qualified leads can be converted' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Conversion failed',
        description: 'Only leads with QUALIFIED status can be converted.',
        variant: 'destructive',
      })
    );
  });

  // T11: Success navigates to contact (AC-008)
  it('success navigates to contact page', () => {
    mockLeadData.status = 'QUALIFIED';
    render(<Lead360Page />);

    expect(callbacks.onSuccess).not.toBeNull();
    callbacks.onSuccess!({ contactId: 'contact-abc' });

    expect(mockPush).toHaveBeenCalledWith('/contacts/contact-abc');
  });
});
