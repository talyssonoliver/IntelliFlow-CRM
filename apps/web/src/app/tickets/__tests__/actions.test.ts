/**
 * @vitest-environment node
 *
 * Unit tests for tickets/actions.ts Server Action.
 *
 * Verifies that invalidateTicketsCache() calls revalidateTag() with the
 * correct tags for all ticket mutation scenarios.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures the mock variable is initialised before vi.mock() hoisting
const { mockRevalidateTag } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockRevalidateTag,
}));

vi.mock('@/lib/cache-tags', () => ({
  TICKETS_LIST: 'tickets:list',
  TICKETS_STATS: 'tickets:stats',
  DASHBOARD: 'dashboard',
  ACTIVITY_FEED: 'activity:feed',
  userTag: (userId: string) => `user:${userId}`,
}));

import { invalidateTicketsCache } from '../actions';

describe('invalidateTicketsCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always invalidates TICKETS_LIST, TICKETS_STATS, and DASHBOARD', async () => {
    await invalidateTicketsCache();

    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  it('also invalidates ACTIVITY_FEED when includeActivityFeed is true', async () => {
    await invalidateTicketsCache(undefined, true);

    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('activity:feed', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(4);
  });

  it('also invalidates the per-user tag when userId is provided', async () => {
    await invalidateTicketsCache('user-abc123');

    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-abc123', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(4);
  });

  it('invalidates all 5 tags when both userId and includeActivityFeed are provided', async () => {
    await invalidateTicketsCache('user-abc123', true);

    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tickets:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('activity:feed', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-abc123', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(5);
  });

  it('does not invalidate ACTIVITY_FEED by default', async () => {
    await invalidateTicketsCache();

    const calls = mockRevalidateTag.mock.calls.map((c: string[]) => c[0]);
    expect(calls).not.toContain('activity:feed');
  });

  it('does not invalidate user tag when userId is undefined', async () => {
    await invalidateTicketsCache(undefined);

    const calls = mockRevalidateTag.mock.calls.map((c: string[]) => c[0]);
    expect(calls.some((tag: string) => tag.startsWith('user:'))).toBe(false);
  });
});
