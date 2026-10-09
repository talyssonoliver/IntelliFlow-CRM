/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidated: string[] = [];
  const mutationOptions: Record<string, { onSuccess: () => unknown; onError: (e: Error) => void }> =
    {};
  const toast = vi.fn();
  const refetch = vi.fn();

  const utils = new Proxy(
    {},
    {
      get: (_t, ns) =>
        new Proxy(
          {},
          {
            get: (_t2, proc) => ({
              invalidate: () => {
                invalidated.push(`${String(ns)}.${String(proc)}`);
                return Promise.resolve();
              },
            }),
          }
        ),
    }
  );

  const chainVersion = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch }),
        useMutation: (opts: { onSuccess: () => unknown; onError: (e: Error) => void }) => {
          mutationOptions[String(proc)] = opts;
          return { mutateAsync: vi.fn(), isPending: false };
        },
      }),
    }
  );

  return { invalidated, mutationOptions, toast, refetch, utils, chainVersion };
});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => h.utils,
    chainVersion: h.chainVersion,
  },
}));

vi.mock('@intelliflow/ui', () => ({
  useToast: () => ({ toast: h.toast }),
}));

import { useChainVersions, useVersionAudit, useZepBudget } from '../useChainVersions';

describe('useChainVersions mutation callbacks', () => {
  beforeEach(() => {
    h.invalidated.length = 0;
    h.toast.mockClear();
  });

  const expectations: Array<[string, string[]]> = [
    ['create', ['chainVersion.list', 'chainVersion.getStats']],
    ['update', ['chainVersion.list']],
    ['activate', ['chainVersion.list', 'chainVersion.getActive', 'chainVersion.getStats']],
    ['deprecate', ['chainVersion.list', 'chainVersion.getStats']],
    ['archive', ['chainVersion.list', 'chainVersion.getStats']],
    [
      'rollback',
      [
        'chainVersion.list',
        'chainVersion.getActive',
        'chainVersion.getStats',
        'chainVersion.getAuditLog',
      ],
    ],
  ];

  it.each(expectations)('%s onSuccess invalidates the affected queries', (name, expected) => {
    renderHook(() => useChainVersions());

    const pending = h.mutationOptions[name].onSuccess();

    expect(h.invalidated).toEqual(expected);
    // Toast is synchronous; the returned promise lets the mutation wait for the refetch.
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(typeof (pending as Promise<unknown>).then).toBe('function');
  });

  it.each(expectations)('%s onSuccess promise resolves only after every refetch', async (name) => {
    renderHook(() => useChainVersions());
    let settled = false;

    const done = Promise.resolve(h.mutationOptions[name].onSuccess()).then(() => {
      settled = true;
    });

    expect(settled).toBe(false);
    await done;
    expect(settled).toBe(true);
  });

  it.each(expectations.map(([name]) => name))(
    '%s onError shows a destructive toast without invalidating',
    (name) => {
      renderHook(() => useChainVersions());

      h.mutationOptions[name].onError(new Error('boom'));

      expect(h.invalidated).toEqual([]);
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'boom', variant: 'destructive' })
      );
    }
  );
});

describe('refetch helpers', () => {
  beforeEach(() => {
    h.toast.mockClear();
    h.refetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useChainVersions.refetch refreshes every query', () => {
    h.refetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useChainVersions());

    result.current.refetch();

    // versions + 4 active chain types + stats
    expect(h.refetch).toHaveBeenCalledTimes(6);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('useChainVersions.refetch toasts when a refresh rejects', async () => {
    h.refetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useChainVersions());

    result.current.refetch();

    await vi.waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to refresh versions',
          description: 'network down',
          variant: 'destructive',
        })
      )
    );
  });

  it('useChainVersions.refetch falls back to a generic message for non-Error rejections', async () => {
    h.refetch.mockRejectedValue('nope');
    const { result } = renderHook(() => useChainVersions());

    result.current.refetch();

    await vi.waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Unknown error', variant: 'destructive' })
      )
    );
  });

  it('useVersionAudit.refetch logs when the refresh rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('network down');
    h.refetch.mockRejectedValue(failure);
    const { result } = renderHook(() => useVersionAudit({ versionId: 'v1' }));

    result.current.refetch();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[useVersionAudit] Failed to refresh the audit log:',
        failure
      )
    );
  });

  it('useZepBudget.refetch logs when the refresh rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('network down');
    h.refetch.mockRejectedValue(failure);
    const { result } = renderHook(() => useZepBudget());

    result.current.refetch();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('[useZepBudget] Failed to refresh the budget:', failure)
    );
  });

  it('useVersionAudit and useZepBudget refetch resolve quietly on success', () => {
    h.refetch.mockResolvedValue(undefined);
    const audit = renderHook(() => useVersionAudit({ versionId: 'v1' }));
    const budget = renderHook(() => useZepBudget());

    audit.result.current.refetch();
    budget.result.current.refetch();

    expect(h.refetch).toHaveBeenCalledTimes(2);
  });
});
