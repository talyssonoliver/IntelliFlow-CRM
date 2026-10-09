/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidate = vi.fn(() => Promise.resolve());
  const mutationOptions: Record<string, { onSuccess: () => unknown }> = {};
  const listRefetch = vi.fn();
  const mutate = vi.fn();

  const queuesAdmin = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({
          data: undefined,
          isLoading: false,
          error: null,
          refetch: listRefetch,
        }),
        useMutation: (opts: { onSuccess: () => unknown }) => {
          mutationOptions[String(proc)] = opts;
          return { mutate, isPending: false, variables: undefined };
        },
      }),
    }
  );

  return { invalidate, mutationOptions, mutate, queuesAdmin, listRefetch };
});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({ queuesAdmin: { list: { invalidate: h.invalidate } } }),
    queuesAdmin: h.queuesAdmin,
  },
}));

import { useQueueMutations, useQueueScheduler } from '../queue-scheduler-hooks';

describe('useQueueMutations', () => {
  beforeEach(() => {
    h.invalidate.mockClear();
    h.mutate.mockClear();
  });

  it.each(['pause', 'resume', 'retryFailed', 'deleteScheduler'])(
    '%s onSuccess returns the queue list invalidation so the mutation waits for fresh data',
    async (name) => {
      let release!: () => void;
      h.invalidate.mockReturnValueOnce(new Promise<void>((resolve) => (release = resolve)));
      renderHook(() => useQueueMutations());

      const result = h.mutationOptions[name].onSuccess();
      let settled = false;
      const done = Promise.resolve(result).then(() => {
        settled = true;
      });

      expect(h.invalidate).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(settled).toBe(false);
      release();
      await done;
      expect(settled).toBe(true);
    }
  );
});

describe('useQueueScheduler refetch', () => {
  beforeEach(() => {
    h.listRefetch.mockReset();
  });

  it('refreshes the queue list', () => {
    h.listRefetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useQueueScheduler());

    result.current.refetch();

    expect(h.listRefetch).toHaveBeenCalledTimes(1);
  });

  it('logs when the refresh rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('redis unavailable');
    h.listRefetch.mockRejectedValue(failure);
    const { result } = renderHook(() => useQueueScheduler());

    result.current.refetch();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[useQueueScheduler] Failed to refresh queues:',
        failure
      )
    );
    errorSpy.mockRestore();
  });
});
