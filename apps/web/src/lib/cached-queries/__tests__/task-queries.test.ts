/**
 * Unit tests for task-queries.ts cached query functions.
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

// ── mock next/cache (wrapper pattern avoids hoisting TDZ issue) ───────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── mock trpc-server ───────────────────────────────────────────────────────────
const mockTaskList = vi.fn();
const mockTaskStats = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchTasksFirstPage, fetchTaskStats } from '../task-queries';
import { TASKS_LIST, TASKS_STATS, DASHBOARD } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

describe('fetchTasksFirstPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      task: { list: { query: mockTaskList }, stats: { query: mockTaskStats } },
    });
    mockTaskList.mockResolvedValue({ tasks: [], total: 0 });
  });

  it('calls cacheLife with LIST_PAGE profile', async () => {
    await fetchTasksFirstPage('tok-1', 'user-1');
    expect(mockCacheLife).toHaveBeenCalledWith(LIST_PAGE);
  });

  it('calls cacheTag with TASKS_LIST', async () => {
    await fetchTasksFirstPage('tok-1', 'user-1');
    expect(mockCacheTag).toHaveBeenCalledWith(TASKS_LIST);
  });

  it('calls cacheTag with userTag for per-user isolation', async () => {
    await fetchTasksFirstPage('tok-1', 'user-abc');
    const calls = mockCacheTag.mock.calls.flat();
    expect(calls).toContain('user:user-abc');
  });

  it('does NOT call cacheTag(userTag) when userId is null', async () => {
    await fetchTasksFirstPage('tok-1', null);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('does NOT call cacheTag(userTag) when userId is undefined', async () => {
    await fetchTasksFirstPage('tok-1', undefined);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('calls task.list with page 1 and descending createdAt', async () => {
    await fetchTasksFirstPage('tok-1', 'user-1');
    expect(mockTaskList).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    );
  });

  it('returns the result from task.list', async () => {
    const payload = { tasks: [{ id: 'task-1' }], total: 1, hasMore: false, limit: 20 };
    mockTaskList.mockResolvedValueOnce(payload);
    const result = await fetchTasksFirstPage('tok-1', 'user-1');
    expect(result).toEqual(payload);
  });

  it('works with a null token (unauthenticated / server render)', async () => {
    await expect(fetchTasksFirstPage(null, null)).resolves.not.toThrow();
  });
});

describe('fetchTaskStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      task: { list: { query: mockTaskList }, stats: { query: mockTaskStats } },
    });
    mockTaskStats.mockResolvedValue({ overdue: 0, dueToday: 0 });
  });

  it('calls cacheLife with DASHBOARD_STATS profile', async () => {
    await fetchTaskStats('tok-1', 'user-1');
    expect(mockCacheLife).toHaveBeenCalledWith(DASHBOARD_STATS);
  });

  it('calls cacheTag with TASKS_STATS and DASHBOARD', async () => {
    await fetchTaskStats('tok-1', 'user-1');
    expect(mockCacheTag).toHaveBeenCalledWith(TASKS_STATS, DASHBOARD);
  });

  it('calls cacheTag with userTag for per-user isolation', async () => {
    await fetchTaskStats('tok-1', 'user-xyz');
    const calls = mockCacheTag.mock.calls.flat();
    expect(calls).toContain('user:user-xyz');
  });

  it('does NOT call cacheTag(userTag) when userId is null', async () => {
    await fetchTaskStats('tok-1', null);
    const calls = mockCacheTag.mock.calls.flat();
    const userTagCalled = calls.some((c) => typeof c === 'string' && c.startsWith('user:'));
    expect(userTagCalled).toBe(false);
  });

  it('calls task.stats', async () => {
    await fetchTaskStats('tok-1', 'user-1');
    expect(mockTaskStats).toHaveBeenCalled();
  });

  it('returns the result from task.stats', async () => {
    const payload = { overdue: 3, dueToday: 5, total: 42 };
    mockTaskStats.mockResolvedValueOnce(payload);
    const result = await fetchTaskStats('tok-1', 'user-1');
    expect(result).toEqual(payload);
  });

  it('works with a null token', async () => {
    await expect(fetchTaskStats(null, null)).resolves.not.toThrow();
  });
});
