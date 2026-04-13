/**
 * @vitest-environment node
 *
 * Unit tests for tasks/actions.ts Server Action.
 *
 * Verifies that invalidateTasksCache() calls revalidateTag() with the
 * correct tags for all task mutation scenarios, including the cross-entity
 * ACTIVITY_FEED invalidation required by task.complete.
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
  TASKS_LIST: 'tasks:list',
  TASKS_STATS: 'tasks:stats',
  DASHBOARD: 'dashboard',
  ACTIVITY_FEED: 'activity:feed',
  userTag: (userId: string) => `user:${userId}`,
}));

import { invalidateTasksCache } from '../actions';

describe('invalidateTasksCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always invalidates TASKS_LIST, TASKS_STATS, and DASHBOARD', async () => {
    await invalidateTasksCache();

    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  it('also invalidates ACTIVITY_FEED when includeActivityFeed is true (task.complete / task.create)', async () => {
    await invalidateTasksCache(undefined, true);

    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('activity:feed', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(4);
  });

  it('also invalidates the per-user tag when userId is provided', async () => {
    await invalidateTasksCache('user-xyz789');

    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-xyz789', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(4);
  });

  it('invalidates all 5 tags when both userId and includeActivityFeed are provided', async () => {
    await invalidateTasksCache('user-xyz789', true);

    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('tasks:stats', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('activity:feed', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-xyz789', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(5);
  });

  it('does not invalidate ACTIVITY_FEED by default (task.update, task.delete, etc.)', async () => {
    await invalidateTasksCache();

    const calls = mockRevalidateTag.mock.calls.map((c: string[]) => c[0]);
    expect(calls).not.toContain('activity:feed');
  });

  it('does not invalidate user tag when userId is undefined', async () => {
    await invalidateTasksCache(undefined);

    const calls = mockRevalidateTag.mock.calls.map((c: string[]) => c[0]);
    expect(calls.some((tag: string) => tag.startsWith('user:'))).toBe(false);
  });
});
