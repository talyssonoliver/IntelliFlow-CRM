/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidated: string[] = [];
  const mutationOptions: Record<string, { onSuccess: () => unknown; onError: (e: Error) => void }> =
    {};
  const toast = vi.fn();

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

  const pipelineConfig = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({ data: undefined, isLoading: false, error: null }),
        useMutation: (opts: { onSuccess: () => unknown; onError: (e: Error) => void }) => {
          mutationOptions[String(proc)] = opts;
          return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
        },
      }),
    }
  );

  return { invalidated, mutationOptions, toast, utils, pipelineConfig };
});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => h.utils,
    pipelineConfig: h.pipelineConfig,
  },
}));

vi.mock('@intelliflow/ui', () => ({
  useToast: () => ({ toast: h.toast }),
}));

import { usePipelineConfig } from '../usePipelineConfig';

describe('usePipelineConfig mutation callbacks', () => {
  beforeEach(() => {
    h.invalidated.length = 0;
    h.toast.mockClear();
  });

  it.each(['updateStage', 'updateAll', 'resetToDefaults'])(
    '%s onSuccess refreshes the stage list and toasts',
    (name) => {
      renderHook(() => usePipelineConfig());

      h.mutationOptions[name].onSuccess();

      expect(h.invalidated).toEqual(['pipelineConfig.getAll']);
      expect(h.toast).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['updateStage', 'updateAll', 'resetToDefaults'])(
    '%s onError shows a destructive toast without refreshing',
    (name) => {
      renderHook(() => usePipelineConfig());

      h.mutationOptions[name].onError(new Error('fail'));

      expect(h.invalidated).toEqual([]);
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'fail', variant: 'destructive' })
      );
    }
  );

  it.each(['updateStage', 'updateAll', 'resetToDefaults'])(
    '%s onSuccess toasts immediately and returns the refresh so the mutation waits for it',
    async (name) => {
      renderHook(() => usePipelineConfig());

      const pending = h.mutationOptions[name].onSuccess();

      expect(h.toast).toHaveBeenCalledTimes(1);
      expect(typeof (pending as Promise<unknown>).then).toBe('function');
      await pending;
    }
  );
});
