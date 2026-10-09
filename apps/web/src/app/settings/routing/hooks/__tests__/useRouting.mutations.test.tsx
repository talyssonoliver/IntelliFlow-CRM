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

  const routing = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
        useMutation: (opts: { onSuccess: () => unknown; onError: (e: Error) => void }) => {
          mutationOptions[String(proc)] = opts;
          return { mutate: vi.fn(), isPending: false };
        },
      }),
    }
  );

  return { invalidated, mutationOptions, toast, utils, routing };
});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => h.utils,
    routing: h.routing,
  },
}));

vi.mock('@intelliflow/ui', () => ({
  useToast: () => ({ toast: h.toast }),
}));

import { useRouting } from '../useRouting';

describe('useRouting mutation callbacks', () => {
  beforeEach(() => {
    h.invalidated.length = 0;
    h.toast.mockClear();
  });

  it.each(['create', 'update', 'delete', 'reorder', 'toggle'])(
    '%s onSuccess invalidates the rule list and returns the promise so the mutation waits',
    async (name) => {
      renderHook(() => useRouting());

      const result = h.mutationOptions[name].onSuccess();

      expect(h.invalidated).toEqual(['routing.list']);
      await expect(result).resolves.toBeUndefined();
    }
  );

  it('assignLead onSuccess invalidates assignments, lead queue and agent workload', async () => {
    renderHook(() => useRouting());

    const result = h.mutationOptions.assignLead.onSuccess();
    await expect(result).resolves.toHaveLength(3);

    expect(h.invalidated).toEqual([
      'routing.getAssignments',
      'routing.getLeadQueue',
      'routing.getAgentWorkload',
    ]);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead assigned' }));
  });

  it.each(['create', 'update', 'delete', 'reorder', 'toggle', 'assignLead'])(
    '%s onError surfaces a destructive toast and does not invalidate',
    (name) => {
      renderHook(() => useRouting());

      h.mutationOptions[name].onError(new Error('nope'));

      expect(h.invalidated).toEqual([]);
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'nope', variant: 'destructive' })
      );
    }
  );
});
