/**
 * Unit tests for ticket-queries.ts cached query functions.
 *
 * Verifies:
 * 1. cacheLife is called with the correct profile
 * 2. cacheTag is called with the correct entity tag(s)
 * 3. userTag(userId) is called for per-user isolation
 * 4. The underlying tRPC caller procedures are invoked with expected args
 * 5. Null / undefined userId edge cases are handled safely
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts ────────────────────────────────────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@intelliflow/api/context', () => ({ createContext: vi.fn() }));
vi.mock('@intelliflow/api/router', () => ({ appRouter: { createCaller: vi.fn() } }));

// ── mock next/cache (wrapper pattern avoids hoisting TDZ issue) ───────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── mock trpc-server ───────────────────────────────────────────────────────────
const mockTicketList = vi.fn();
const mockTicketStats = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchTicketsFirstPage, fetchTicketStats } from '../ticket-queries';
import { TICKETS_LIST, TICKETS_STATS, DASHBOARD } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

describe('fetchTicketsFirstPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      ticket: { list: mockTicketList, stats: mockTicketStats },
    });
    mockTicketList.mockResolvedValue({ tickets: [], total: 0 });
  });

  it('calls cacheLife with LIST_PAGE profile', async () => {
    await fetchTicketsFirstPage('tok-1', 'user-1');
    expect(mockCacheLife).toHaveBeenCalledWith(LIST_PAGE);
  });

  it('calls cacheTag with TICKETS_LIST', async () => {
    await fetchTicketsFirstPage('tok-1', 'user-1');
    expect(mockCacheTag).toHaveBeenCalledWith(TICKETS_LIST);
  });

  it('calls cacheTag with userTag for per-user isolation', async () => {
    await fetchTicketsFirstPage('tok-1', 'user-abc');
    const calls = mockCacheTag.mock.calls.flat();
    expect(calls).toContain('user:user-abc');
  });

  it('does NOT call cacheTag(userTag) when userId is null', async () => {
    await fetchTicketsFirstPage('tok-1', null);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('does NOT call cacheTag(userTag) when userId is undefined', async () => {
    await fetchTicketsFirstPage('tok-1', undefined);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('calls ticket.list with page 1, limit 25, descending createdAt', async () => {
    await fetchTicketsFirstPage('tok-1', 'user-1');
    expect(mockTicketList).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    );
  });

  it('returns the result from ticket.list', async () => {
    const payload = { tickets: [{ id: 't1' }], total: 1 };
    mockTicketList.mockResolvedValueOnce(payload);
    const result = await fetchTicketsFirstPage('tok-1', 'user-1');
    expect(result).toEqual(payload);
  });

  it('works with a null token (unauthenticated / server render)', async () => {
    await expect(fetchTicketsFirstPage(null, null)).resolves.not.toThrow();
  });
});

describe('fetchTicketStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      ticket: { list: mockTicketList, stats: mockTicketStats },
    });
    mockTicketStats.mockResolvedValue({ open: 0, inProgress: 0 });
  });

  it('calls cacheLife with DASHBOARD_STATS profile', async () => {
    await fetchTicketStats('tok-1', 'user-1');
    expect(mockCacheLife).toHaveBeenCalledWith(DASHBOARD_STATS);
  });

  it('calls cacheTag with TICKETS_STATS and DASHBOARD', async () => {
    await fetchTicketStats('tok-1', 'user-1');
    expect(mockCacheTag).toHaveBeenCalledWith(TICKETS_STATS, DASHBOARD);
  });

  it('calls cacheTag with userTag for per-user isolation', async () => {
    await fetchTicketStats('tok-1', 'user-xyz');
    const calls = mockCacheTag.mock.calls.flat();
    expect(calls).toContain('user:user-xyz');
  });

  it('does NOT call cacheTag(userTag) when userId is null', async () => {
    await fetchTicketStats('tok-1', null);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('calls ticket.stats', async () => {
    await fetchTicketStats('tok-1', 'user-1');
    expect(mockTicketStats).toHaveBeenCalled();
  });

  it('returns the result from ticket.stats', async () => {
    const payload = { open: 5, inProgress: 3, breached: 1, resolvedToday: 2 };
    mockTicketStats.mockResolvedValueOnce(payload);
    const result = await fetchTicketStats('tok-1', 'user-1');
    expect(result).toEqual(payload);
  });

  it('works with a null token', async () => {
    await expect(fetchTicketStats(null, null)).resolves.not.toThrow();
  });
});
