/**
 * @vitest-environment jsdom
 */
/**
 * Tickets list page: each bulk mutation's onSuccess must RETURN the refresh of
 * the list + stats (and the server cache flush) so the mutation stays pending
 * until fresh data has arrived. A failed server-cache flush must be logged and
 * must not reject the mutation.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
vi.mock('@/components/shared', () => ({ PageHeader: () => <div /> }));
vi.mock('@/components/tickets', () => ({ TicketList: () => <div /> }));
vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({ mapTicketListItems: () => [] }));

const invalidateTicketsCache = vi.fn();
vi.mock('@/app/tickets/actions', () => ({
  invalidateTicketsCache: (...args: unknown[]) => invalidateTicketsCache(...args),
}));

import TicketsPage from '../(list)/page';

const BULK = ['bulkAssign', 'bulkUpdateStatus', 'bulkResolve', 'bulkEscalate', 'bulkClose'];

describe('TicketsPage bulk mutation onSuccess', () => {
  beforeEach(() => {
    capture.reset();
    invalidateTicketsCache.mockReset();
    invalidateTicketsCache.mockResolvedValue(undefined);
    render(<TicketsPage />);
  });

  it.each(BULK)('ticket.%s returns the refresh and flushes the server cache', async (name) => {
    const result = capture.mutations[`ticket.${name}`].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.list', 'ticket.stats']);
    expect(invalidateTicketsCache).toHaveBeenCalledTimes(1);
  });

  it('logs a failed server-cache flush without rejecting the mutation', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('flush failed');
    invalidateTicketsCache.mockRejectedValue(failure);

    await expect(capture.mutations['ticket.bulkAssign'].onSuccess?.()).resolves.toBeDefined();

    expect(errorSpy).toHaveBeenCalledWith('Failed to revalidate the tickets cache:', failure);
    errorSpy.mockRestore();
  });
});
