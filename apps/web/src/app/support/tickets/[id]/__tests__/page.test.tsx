/**
 * Support Ticket Detail Page Tests (PG-048)
 *
 * Verifies page wiring: tRPC integration, TicketDetail props, support-context constraints.
 * Mocks TicketDetail to verify prop wiring (not re-test PG-137).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  createMockTicketDetail,
  createMockTRPCQuery,
  createMockTRPCMutation,
} from '@/components/tickets/__tests__/ticket-test-utils';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ticket-abc-123' }),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/support/tickets/ticket-abc-123',
}));

const mockToast = vi.fn();
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    toast: (...args: unknown[]) => mockToast(...args),
  };
});

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-001', name: 'Support Agent' },
  }),
}));

// Mock mapTicketToDetailData
const mockMapTicketToDetailData = vi.fn((_ticket: unknown) => createMockTicketDetail());
vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({
  mapTicketToDetailData: (arg: unknown) => mockMapTicketToDetailData(arg),
}));

vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (src: unknown) => src ?? null,
}));

// Capture TicketDetail props
let capturedTicketDetailProps: Record<string, unknown> = {};
vi.mock('@/components/tickets', () => ({
  TicketDetail: (props: Record<string, unknown>) => {
    capturedTicketDetailProps = props;
    return <div data-testid="ticket-detail-mock">TicketDetail Mock</div>;
  },
}));

// Mock tRPC api
const mockGetById = createMockTRPCQuery(createMockTicketDetail());
const mockAssignees = createMockTRPCQuery([
  { id: 'user-001', name: 'Agent 1', title: 'Support', avatar: null },
]);
const mockUpdateMutation = createMockTRPCMutation();
const mockAddResponseMutation = createMockTRPCMutation();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      ticket: {
        getById: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    ticket: {
      getById: { useQuery: vi.fn(() => mockGetById) },
      assignees: { useQuery: vi.fn(() => mockAssignees) },
      update: {
        useMutation: vi.fn((opts?: Record<string, unknown>) => {
          if (opts?.onSuccess)
            (mockUpdateMutation as Record<string, unknown>).__onSuccess = opts.onSuccess;
          if (opts?.onError)
            (mockUpdateMutation as Record<string, unknown>).__onError = opts.onError;
          return mockUpdateMutation;
        }),
      },
      addResponse: {
        useMutation: vi.fn((opts?: Record<string, unknown>) => {
          if (opts?.onSuccess)
            (mockAddResponseMutation as Record<string, unknown>).__onSuccess = opts.onSuccess;
          if (opts?.onError)
            (mockAddResponseMutation as Record<string, unknown>).__onError = opts.onError;
          return mockAddResponseMutation;
        }),
      },
    },
  },
}));

// Mock PageHeader
vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
  }: {
    title: string;
    breadcrumbs: Array<{ label: string }>;
  }) => (
    <div data-testid="page-header" data-title={title}>
      {breadcrumbs?.map((b) => (
        <span key={b.label}>{b.label}</span>
      ))}
    </div>
  ),
}));

// ─── Lazy Import ────────────────────────────────────────────────────────────

let SupportTicketDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  capturedTicketDetailProps = {};

  // Reset query mocks to default state
  mockGetById.data = createMockTicketDetail();
  mockGetById.isLoading = false;

  const mod = await import('../page');
  SupportTicketDetailPage = mod.default;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SupportTicketDetailPage', () => {
  // ─── Loading State ──────────────────────────────────────────────────────

  it('shows loading skeleton when isLoading is true', () => {
    mockGetById.isLoading = true;
    mockGetById.data = undefined;
    render(<SupportTicketDetailPage />);
    expect(screen.getByTestId('ticket-detail-skeleton')).toBeInTheDocument();
  });

  // ─── Not Found State ──────────────────────────────────────────────────────

  it('renders not-found state with support breadcrumbs when ticket is null', () => {
    mockGetById.data = null as unknown as undefined;
    render(<SupportTicketDetailPage />);
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  // ─── Data Wiring ──────────────────────────────────────────────────────────

  it('maps ticket data via mapTicketToDetailData and passes to TicketDetail', () => {
    render(<SupportTicketDetailPage />);
    expect(mockMapTicketToDetailData).toHaveBeenCalled();
    expect(screen.getByTestId('ticket-detail-mock')).toBeInTheDocument();
  });

  it('extracts id from useParams and passes to getById.useQuery', async () => {
    render(<SupportTicketDetailPage />);
    const { api } = await import('@/lib/api');
    expect(api.ticket.getById.useQuery).toHaveBeenCalledWith({ id: 'ticket-abc-123' });
  });

  // ─── Mutation Wiring ──────────────────────────────────────────────────────

  it('calls update.mutateAsync for status change', async () => {
    render(<SupportTicketDetailPage />);
    const onStatusChange = capturedTicketDetailProps.onStatusChange as (s: string) => Promise<void>;
    await act(() => onStatusChange('IN_PROGRESS'));
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ticket-abc-123', status: 'IN_PROGRESS' })
    );
  });

  it('shows success toast after status change', async () => {
    render(<SupportTicketDetailPage />);
    const onStatusChange = capturedTicketDetailProps.onStatusChange as (s: string) => Promise<void>;
    await act(() => onStatusChange('IN_PROGRESS'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Status') })
    );
  });

  it('shows destructive toast on status change error', async () => {
    mockUpdateMutation.mutateAsync.mockRejectedValueOnce(new Error('fail'));
    render(<SupportTicketDetailPage />);

    // Trigger onError callback
    const onError = (mockUpdateMutation as Record<string, unknown>).__onError as (e: Error) => void;
    if (onError) onError(new Error('fail'));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('calls update.mutateAsync for priority change', async () => {
    render(<SupportTicketDetailPage />);
    const onPriorityChange = capturedTicketDetailProps.onPriorityChange as (
      p: string
    ) => Promise<void>;
    await act(() => onPriorityChange('HIGH'));
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ticket-abc-123', priority: 'HIGH' })
    );
  });

  it('calls addResponse.mutateAsync for public reply', async () => {
    render(<SupportTicketDetailPage />);
    const onAddResponse = capturedTicketDetailProps.onAddResponse as (
      c: string,
      i: boolean
    ) => Promise<void>;
    await act(() => onAddResponse('Reply text', false));
    expect(mockAddResponseMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-abc-123',
        content: 'Reply text',
        authorRole: 'agent',
      })
    );
  });

  it('calls addResponse.mutateAsync with authorRole "internal" for internal note', async () => {
    render(<SupportTicketDetailPage />);
    const onAddResponse = capturedTicketDetailProps.onAddResponse as (
      c: string,
      i: boolean
    ) => Promise<void>;
    await act(() => onAddResponse('Internal info', true));
    expect(mockAddResponseMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-abc-123',
        content: 'Internal info',
        authorRole: 'internal',
      })
    );
  });

  it('calls update.mutateAsync with RESOLVED for resolve', async () => {
    render(<SupportTicketDetailPage />);
    const onResolve = capturedTicketDetailProps.onResolve as (r: unknown) => Promise<void>;
    await act(() => onResolve({ type: 'resolved', summary: 'Fixed' }));
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ticket-abc-123', status: 'RESOLVED' })
    );
  });

  it('calls update.mutateAsync with CLOSED + redirect for close', async () => {
    render(<SupportTicketDetailPage />);
    const onClose = capturedTicketDetailProps.onClose as () => Promise<void>;
    await act(() => onClose());
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ticket-abc-123', status: 'CLOSED' })
    );
    expect(mockPush).toHaveBeenCalledWith('/support/tickets');
  });

  it('calls update.mutateAsync for assign', async () => {
    render(<SupportTicketDetailPage />);
    const onAssign = capturedTicketDetailProps.onAssign as (id: string) => Promise<void>;
    await act(() => onAssign('a1b2c3d4-e5f6-1234-abcd-123456789012'));
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ticket-abc-123',
        assigneeId: 'a1b2c3d4-e5f6-1234-abcd-123456789012',
      })
    );
  });

  // ─── Support Context Constraints ──────────────────────────────────────────

  it('does not pass onDelete to TicketDetail (undefined)', () => {
    render(<SupportTicketDetailPage />);
    expect(capturedTicketDetailProps.onDelete).toBeUndefined();
  });

  it('does not pass onArchive to TicketDetail (undefined)', () => {
    render(<SupportTicketDetailPage />);
    expect(capturedTicketDetailProps.onArchive).toBeUndefined();
  });

  it('passes listHref="/support/tickets" and detailUrlPrefix="/support/tickets"', () => {
    render(<SupportTicketDetailPage />);
    expect(capturedTicketDetailProps.listHref).toBe('/support/tickets');
    expect(capturedTicketDetailProps.detailUrlPrefix).toBe('/support/tickets');
  });
});
