/**
 * Ticket detail page: record-id gating (#1097).
 *
 * Ticket and user ids are cuids (Prisma @default(cuid())). The page gated the
 * assignee behind a UUID regex, so a ticket could not be assigned to a real user.
 * TicketDetail is mocked to capture the handlers the page wires into it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  createMockTicketDetail,
  createMockTRPCQuery,
  createMockTRPCMutation,
} from '@/components/tickets/__tests__/ticket-test-utils';

const TICKET_ID = 'cmhbx3k2p0001l8086e4f5g6h';
const CUID_USER_ID = 'cmhbx3k2p0000l8086a1b2c3d';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: TICKET_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => `/tickets/${TICKET_ID}`,
}));

const mockToast = vi.fn();
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: (...args: unknown[]) => mockToast(...args) };
});

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: CUID_USER_ID, name: 'Agent' } }) }));

vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({
  mapTicketToDetailData: () => createMockTicketDetail(),
}));

vi.mock('@/lib/shared/avatar-utils', () => ({
  normalizeAvatarSource: (src: unknown) => src ?? null,
}));

vi.mock('@/lib/tickets/revalidate-tickets-cache', () => ({
  revalidateTicketsCache: vi.fn(async () => undefined),
}));

let capturedTicketDetailProps: Record<string, unknown> = {};
vi.mock('@/components/tickets', () => ({
  TicketDetail: (props: Record<string, unknown>) => {
    capturedTicketDetailProps = props;
    return <div data-testid="ticket-detail-mock" />;
  },
}));

const mockGetById = createMockTRPCQuery(createMockTicketDetail());
const mockGetByIdUseQuery = vi.fn((..._args: unknown[]) => mockGetById);
const mockAssignees = createMockTRPCQuery([]);
const mockUpdateMutation = createMockTRPCMutation();
const mockOtherMutation = createMockTRPCMutation();

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
      getById: { useQuery: (...args: unknown[]) => mockGetByIdUseQuery(...args) },
      assignees: { useQuery: vi.fn(() => mockAssignees) },
      update: { useMutation: vi.fn(() => mockUpdateMutation) },
      addResponse: { useMutation: vi.fn(() => mockOtherMutation) },
      delete: { useMutation: vi.fn(() => mockOtherMutation) },
      archive: { useMutation: vi.fn(() => mockOtherMutation) },
    },
  },
}));

let TicketDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  capturedTicketDetailProps = {};
  mockGetById.data = createMockTicketDetail();
  mockGetById.isLoading = false;
  TicketDetailPage = (await import('../page')).default;
});

describe('TicketDetailPage record ids (#1097)', () => {
  it('queries a ticket whose id is a cuid', () => {
    render(<TicketDetailPage />);
    expect(mockGetByIdUseQuery).toHaveBeenCalledWith(
      { id: TICKET_ID },
      expect.objectContaining({ enabled: true })
    );
  });

  it('assigns the ticket to a user whose id is a cuid', async () => {
    render(<TicketDetailPage />);
    const onAssign = capturedTicketDetailProps.onAssign as (id: string) => Promise<void>;
    await act(() => onAssign(CUID_USER_ID));
    expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: TICKET_ID, assigneeId: CUID_USER_ID })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Invalid Assignee' })
    );
  });

  it('still refuses an assignee id that is not a record id', async () => {
    render(<TicketDetailPage />);
    const onAssign = capturedTicketDetailProps.onAssign as (id: string) => Promise<void>;
    await act(() => onAssign('../admin'));
    expect(mockUpdateMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invalid Assignee' }));
  });
});
