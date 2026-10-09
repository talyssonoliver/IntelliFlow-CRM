/**
 * @vitest-environment jsdom
 *
 * TaskDetailPage: every mutation's onSuccess must give the user feedback
 * immediately and return the cache refresh so the mutation settles only once
 * fresh data has been requested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

const mockPush = vi.hoisted(() => vi.fn());
const revalidateTasksCache = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'task-1' }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@intelliflow/ui', () => ({ toast }));
vi.mock('@/lib/tasks/revalidate-tasks-cache', () => ({ revalidateTasksCache }));
vi.mock('@/components/shared', () => ({ PageHeader: () => null }));
vi.mock('@/components/tasks/TaskDetail', () => ({ TaskDetail: () => null }));
vi.mock('@/components/tasks/TaskForm', () => ({ TaskForm: () => null }));
vi.mock('@/components/shared/activity-feed', () => ({ ActivityFeed: () => null }));

import TaskDetailPage from '../page';

async function runOnSuccess(procedure: string) {
  const result = capture.mutations[procedure].onSuccess?.();
  expect(result).toBeInstanceOf(Promise);
  await result;
}

describe('TaskDetailPage mutation onSuccess handlers', () => {
  beforeEach(() => {
    capture.reset();
    mockPush.mockReset();
    toast.mockReset();
    revalidateTasksCache.mockReset().mockResolvedValue(undefined);
    render(<TaskDetailPage />);
  });

  it('complete: toasts, then refreshes the task, list and activity-feed cache', async () => {
    await runOnSuccess('task.complete');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Completed' }));
    expect(capture.invalidations).toEqual(['task.getById', 'task.list']);
    expect(revalidateTasksCache).toHaveBeenCalledWith(undefined, true);
  });

  it('update: toasts and refreshes the task and list', async () => {
    await runOnSuccess('task.update');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Updated' }));
    expect(capture.invalidations).toEqual(['task.getById', 'task.list']);
    expect(revalidateTasksCache).toHaveBeenCalledTimes(1);
  });

  it('delete: toasts, navigates back to the list and refreshes it', async () => {
    await runOnSuccess('task.delete');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Deleted' }));
    expect(mockPush).toHaveBeenCalledWith('/tasks');
    expect(capture.invalidations).toEqual(['task.list']);
    expect(revalidateTasksCache).toHaveBeenCalledTimes(1);
  });

  it('start: toasts and refreshes the task and list', async () => {
    await runOnSuccess('task.start');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Started' }));
    expect(capture.invalidations).toEqual(['task.getById', 'task.list']);
  });

  it('archive: toasts, navigates back and refreshes task, list and stats', async () => {
    await runOnSuccess('task.archive');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Archived' }));
    expect(mockPush).toHaveBeenCalledWith('/tasks');
    expect(capture.invalidations).toEqual(['task.getById', 'task.list', 'task.stats']);
  });

  it('assign: toasts and refreshes task, list and stats', async () => {
    await runOnSuccess('task.assign');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Assigned' }));
    expect(capture.invalidations).toEqual(['task.getById', 'task.list', 'task.stats']);
  });

  it('reschedule: toasts and refreshes task, list and stats', async () => {
    await runOnSuccess('task.reschedule');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task Rescheduled' }));
    expect(capture.invalidations).toEqual(['task.getById', 'task.list', 'task.stats']);
  });
});
