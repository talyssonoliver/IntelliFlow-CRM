/**
 * @vitest-environment jsdom
 *
 * TasksListPage: mutation onSuccess handlers return the cache refresh, and the
 * bulk handlers refresh the lists once every item settled, reporting a failed
 * refresh to the user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  revalidateTasksCache: vi.fn(),
  invalidate: vi.fn(),
  mutateAsync: vi.fn(),
  mutations: {} as Record<string, { onSuccess?: () => unknown }>,
  invalidated: [] as string[],
  list: {} as {
    onBulkComplete?: (ids: string[]) => Promise<void>;
    onBulkDelete?: (ids: string[]) => Promise<void>;
    onBulkArchive?: (ids: string[]) => Promise<void>;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock('@intelliflow/ui', () => ({ toast: h.toast }));
vi.mock('@/lib/tasks/revalidate-tasks-cache', () => ({
  revalidateTasksCache: h.revalidateTasksCache,
}));

function mutation(name: string) {
  return {
    useMutation: (options: { onSuccess?: () => unknown }) => {
      h.mutations[name] = options;
      return { mutate: vi.fn(), mutateAsync: h.mutateAsync, isPending: false };
    },
  };
}

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      task: {
        list: { invalidate: () => h.invalidate('task.list') },
        stats: { invalidate: () => h.invalidate('task.stats') },
      },
    }),
    task: {
      list: {
        useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
      },
      stats: { useQuery: () => ({ data: undefined }) },
      create: mutation('create'),
      update: mutation('update'),
      complete: mutation('complete'),
      delete: mutation('delete'),
      archive: mutation('archive'),
    },
  },
}));

vi.mock('@/lib/shared/filter-utils', () => ({
  taskStatusOptions: () => [],
  taskPriorityOptions: () => [],
}));
vi.mock('@/components/shared', () => ({ PageHeader: () => null, SearchFilterBar: () => null }));
vi.mock('@/components/tasks/TaskForm', () => ({ TaskForm: () => null }));
vi.mock('@/components/tasks/ReminderConfig', () => ({ ReminderConfig: () => null }));
vi.mock('@/components/tasks/TaskList', () => ({
  TaskList: (props: typeof h.list) => {
    h.list = props;
    return null;
  },
}));

import TasksListPage from '../page';

describe('TasksListPage mutation onSuccess handlers', () => {
  beforeEach(() => {
    h.toast.mockReset();
    h.invalidate.mockReset();
    h.revalidateTasksCache.mockReset().mockResolvedValue(undefined);
    h.mutateAsync.mockReset().mockResolvedValue({});
    h.mutations = {};
    h.list = {};
    render(<TasksListPage />);
  });

  async function runOnSuccess(name: string) {
    const result = h.mutations[name].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
  }

  it.each([
    ['create', 'Task Created', true],
    ['update', 'Task Updated', false],
    ['complete', 'Task Completed', true],
    ['delete', 'Task Deleted', false],
    ['archive', 'Task Archived', false],
  ])(
    '%s: toasts and returns the list, stats and server-cache refresh',
    async (name, title, feed) => {
      await runOnSuccess(name);
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title }));
      expect(h.invalidate.mock.calls.map((c) => c[0])).toEqual(['task.list', 'task.stats']);
      expect(h.revalidateTasksCache).toHaveBeenCalledTimes(1);
      if (feed) {
        expect(h.revalidateTasksCache).toHaveBeenCalledWith(undefined, true);
      }
    }
  );
});

describe('TasksListPage bulk handlers', () => {
  beforeEach(() => {
    h.toast.mockReset();
    h.invalidate.mockReset().mockResolvedValue(undefined);
    h.mutateAsync.mockReset().mockResolvedValue({});
    h.list = {};
    render(<TasksListPage />);
  });

  it('refreshes the list and stats after every bulk-completed item settled', async () => {
    h.mutateAsync.mockRejectedValueOnce(new Error('one failed'));
    await h.list.onBulkComplete?.(['t1', 't2']);
    expect(h.mutateAsync).toHaveBeenCalledWith({ taskId: 't1' });
    expect(h.mutateAsync).toHaveBeenCalledWith({ taskId: 't2' });
    expect(h.invalidate.mock.calls.map((c) => c[0])).toEqual(['task.list', 'task.stats']);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('refreshes after bulk delete', async () => {
    await h.list.onBulkDelete?.(['t1']);
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: 't1' });
    expect(h.invalidate.mock.calls.map((c) => c[0])).toEqual(['task.list', 'task.stats']);
  });

  it('refreshes after bulk archive', async () => {
    await h.list.onBulkArchive?.(['t1']);
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: 't1' });
    expect(h.invalidate.mock.calls.map((c) => c[0])).toEqual(['task.list', 'task.stats']);
  });

  it('tells the user when the refresh itself fails', async () => {
    h.invalidate.mockRejectedValue(new Error('network down'));
    await h.list.onBulkComplete?.(['t1']);
    expect(h.toast).toHaveBeenCalledWith({
      title: 'Refresh Failed',
      description: 'network down',
      variant: 'destructive',
    });
  });

  it('falls back to a generic message when the refresh failure is not an Error', async () => {
    h.invalidate.mockRejectedValue('boom');
    await h.list.onBulkDelete?.(['t1']);
    expect(h.toast).toHaveBeenCalledWith({
      title: 'Refresh Failed',
      description: 'Could not refresh the task list.',
      variant: 'destructive',
    });
  });
});
