/**
 * @vitest-environment jsdom
 */
/**
 * Support ticket list + detail pages: each mutation's onSuccess must RETURN the
 * refresh of the affected queries so the mutation stays pending until the
 * refetch has finished.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ticket-abc-123' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/hooks/useTicketFilters', () => ({
  useTicketFilters: () => ({
    filters: {
      search: '',
      status: '',
      priority: '',
      slaStatus: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      page: 1,
      limit: 20,
    },
    queryParams: {},
    setSearch: vi.fn(),
    setStatusFilter: vi.fn(),
    setPriorityFilter: vi.fn(),
    setSLAFilter: vi.fn(),
    setSort: vi.fn(),
    setPage: vi.fn(),
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Agent' } }) }));
vi.mock('@/components/shared', () => ({ PageHeader: () => <div /> }));
vi.mock('@/components/tickets', () => ({ TicketDetail: () => <div /> }));
vi.mock('@/components/tickets/ticket-list', () => ({ SupportTicketList: () => <div /> }));
vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({
  mapTicketListItems: () => [],
  mapTicketToDetailData: () => ({}),
}));
vi.mock('@/lib/shared/avatar-utils', () => ({ normalizeAvatarSource: () => null }));

import SupportTicketsPage from '../(list)/page';
import SupportTicketDetailPage from '../[id]/page';

describe('support ticket pages mutation onSuccess', () => {
  beforeEach(() => {
    capture.reset();
  });

  it.each(['bulkAssign', 'bulkUpdateStatus', 'bulkResolve'])(
    'list page ticket.%s returns the list and stats refresh',
    async (name) => {
      render(<SupportTicketsPage />);
      const result = capture.mutations[`ticket.${name}`].onSuccess?.();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(capture.invalidations).toEqual(['ticket.list', 'ticket.stats']);
    }
  );

  it('detail page update returns the ticket, list and stats refresh', async () => {
    render(<SupportTicketDetailPage />);
    const result = capture.mutations['ticket.update'].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.getById', 'ticket.list', 'ticket.stats']);
  });

  it('detail page addResponse returns the ticket refresh', async () => {
    render(<SupportTicketDetailPage />);
    const result = capture.mutations['ticket.addResponse'].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.getById']);
  });
});
