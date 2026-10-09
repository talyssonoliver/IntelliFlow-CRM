// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  options: {} as Record<
    string,
    { onSuccess?: () => Promise<unknown>; onError?: (e: Error) => void }
  >,
  invalidateList: vi.fn(),
  invalidateStats: vi.fn(),
  revalidate: vi.fn(),
  revalidateResult: undefined as undefined | Promise<void>,
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/app/deals/actions', () => ({
  revalidateDealCaches: (...args: unknown[]) => {
    mocks.revalidate(...args);
    return mocks.revalidateResult ?? Promise.resolve();
  },
}));
vi.mock('@/components/shared', () => ({ SearchFilterBar: () => null }));
vi.mock('@intelliflow/ui', () => ({
  DataTable: () => null,
  TableRowActions: () => null,
  ConfirmationDialog: () => null,
  StatusSelectDialog: () => null,
  Skeleton: () => null,
  toast: (...args: unknown[]) => mocks.toast(...args),
}));
vi.mock('@/lib/trpc', () => {
  const mutation = (name: string) => ({
    useMutation: (opts: { onSuccess?: () => Promise<unknown> }) => {
      mocks.options[name] = opts;
      return { mutateAsync: vi.fn(), isPending: false };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        opportunity: {
          list: { invalidate: mocks.invalidateList },
          stats: { invalidate: mocks.invalidateStats },
        },
      }),
      opportunity: {
        list: {
          useQuery: () => ({
            data: undefined,
            isLoading: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          }),
        },
        update: mutation('update'),
        delete: mutation('delete'),
        bulkUpdateStage: mutation('bulkUpdateStage'),
        bulkDelete: mutation('bulkDelete'),
      },
    },
  };
});

import { DealListView } from '../DealListView';

describe('DealListView mutation success handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options = {};
    mocks.revalidateResult = undefined;
  });

  it.each(['update', 'delete', 'bulkUpdateStage', 'bulkDelete'])(
    '%s onSuccess revalidates caches and invalidates list + stats',
    async (name) => {
      render(<DealListView />);
      await act(async () => {
        await mocks.options[name].onSuccess?.();
      });

      expect(mocks.revalidate).toHaveBeenCalledWith('user-1');
      expect(mocks.invalidateList).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateStats).toHaveBeenCalledTimes(1);
    }
  );

  it('delete onSuccess shows a confirmation toast and onError a destructive toast', async () => {
    render(<DealListView />);
    await act(async () => {
      await mocks.options.delete.onSuccess?.();
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deal Deleted' }));

    mocks.options.delete.onError?.(new Error('boom'));
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete Failed', description: 'boom' })
    );
  });
});

describe('DealListView mutation success handlers — failure and ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options = {};
    mocks.revalidateResult = undefined;
  });

  it('logs, and still resolves, when server cache revalidation rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('revalidate failed');
    mocks.revalidateResult = Promise.reject(boom);
    render(<DealListView />);
    await act(async () => {
      await expect(mocks.options.update.onSuccess?.()).resolves.toBeDefined();
    });
    expect(errorSpy).toHaveBeenCalledWith('[DealListView] Failed to revalidate deal caches:', boom);
    expect(mocks.invalidateList).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('stays pending until the list invalidation has finished', async () => {
    let finish: () => void = () => undefined;
    mocks.invalidateList.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    render(<DealListView />);
    let settled = false;
    const pending = mocks.options.bulkDelete.onSuccess!().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await act(async () => {
      await pending;
    });
    expect(settled).toBe(true);
  });
});
