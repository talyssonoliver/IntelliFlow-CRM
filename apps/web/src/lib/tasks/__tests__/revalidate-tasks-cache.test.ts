import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidateTasksCache = vi.hoisted(() => vi.fn());
vi.mock('@/app/tasks/actions', () => ({ invalidateTasksCache }));

import { revalidateTasksCache } from '../revalidate-tasks-cache';

describe('revalidateTasksCache', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invalidateTasksCache.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('forwards the user id and activity-feed flag to the server action', async () => {
    invalidateTasksCache.mockResolvedValue(undefined);
    await revalidateTasksCache('user-1', true);
    expect(invalidateTasksCache).toHaveBeenCalledWith('user-1', true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('defaults to no user and no activity feed', async () => {
    invalidateTasksCache.mockResolvedValue(undefined);
    await revalidateTasksCache();
    expect(invalidateTasksCache).toHaveBeenCalledWith(undefined, false);
  });

  it('reports a failed revalidation to the console and still resolves', async () => {
    const failure = new Error('cache unavailable');
    invalidateTasksCache.mockRejectedValue(failure);
    await expect(revalidateTasksCache()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('Failed to revalidate the tasks cache:', failure);
  });
});
