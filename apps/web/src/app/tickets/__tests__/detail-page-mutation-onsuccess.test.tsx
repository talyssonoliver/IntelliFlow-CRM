/**
 * @vitest-environment jsdom
 */
/**
 * Ticket detail page: each mutation's onSuccess must RETURN the refresh of the
 * affected queries (and the server cache flush), after the synchronous UI
 * feedback (toast, navigation) has already run.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1234567890abcdef' }),
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockToast = vi.fn();
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: (...args: unknown[]) => mockToast(...args) };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Agent' } }) }));
vi.mock('@/components/tickets', () => ({ TicketDetail: () => <div /> }));
vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({ mapTicketToDetailData: () => ({}) }));
vi.mock('@/lib/shared/avatar-utils', () => ({ normalizeAvatarSource: () => null }));

const invalidateTicketsCache = vi.fn();
vi.mock('@/app/tickets/actions', () => ({
  invalidateTicketsCache: (...args: unknown[]) => invalidateTicketsCache(...args),
}));

import TicketDetailPage from '../[id]/page';

describe('TicketDetailPage mutation onSuccess', () => {
  beforeEach(() => {
    capture.reset();
    mockPush.mockReset();
    mockToast.mockReset();
    invalidateTicketsCache.mockReset();
    invalidateTicketsCache.mockResolvedValue(undefined);
    render(<TicketDetailPage />);
  });

  it('update returns the ticket, list and stats refresh and flushes the server cache', async () => {
    const result = capture.mutations['ticket.update'].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.getById', 'ticket.list', 'ticket.stats']);
    expect(invalidateTicketsCache).toHaveBeenCalledTimes(1);
  });

  it('addResponse toasts first, then returns the ticket refresh', async () => {
    const result = capture.mutations['ticket.addResponse'].onSuccess?.();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Response Added' }));
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.getById']);
  });

  it('delete toasts and navigates, then returns the list and stats refresh', async () => {
    const result = capture.mutations['ticket.delete'].onSuccess?.();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ticket Deleted' }));
    expect(mockPush).toHaveBeenCalledWith('/tickets');
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.list', 'ticket.stats']);
    expect(invalidateTicketsCache).toHaveBeenCalledTimes(1);
  });

  it('archive toasts and navigates, then returns the full refresh', async () => {
    const result = capture.mutations['ticket.archive'].onSuccess?.();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ticket Archived' }));
    expect(mockPush).toHaveBeenCalledWith('/tickets');
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(capture.invalidations).toEqual(['ticket.getById', 'ticket.list', 'ticket.stats']);
    expect(invalidateTicketsCache).toHaveBeenCalledTimes(1);
  });
});
