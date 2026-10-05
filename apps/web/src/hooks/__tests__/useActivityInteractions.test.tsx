/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidated: string[] = [];
  const mutationOptions: Record<string, Record<string, (...args: any[]) => unknown>> = {};
  const toast = vi.fn();

  const utils = {
    activityFeed: {
      getComments: {
        invalidate: () => {
          invalidated.push('getComments');
          return Promise.resolve();
        },
      },
      getReactions: {
        invalidate: () => {
          invalidated.push('getReactions');
          return Promise.resolve();
        },
      },
    },
  };

  const activityFeed = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({ data: undefined }),
        useMutation: (opts: Record<string, (...args: any[]) => unknown>) => {
          mutationOptions[String(proc)] = opts;
          return { mutate: vi.fn(), isPending: false };
        },
      }),
    }
  );

  return { invalidated, mutationOptions, toast, utils, activityFeed };
});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => h.utils,
    activityFeed: h.activityFeed,
  },
}));

vi.mock('@intelliflow/ui', () => ({
  toast: h.toast,
}));

import { useActivityComments } from '../useActivityComments';
import { useActivityReactions } from '../useActivityReactions';

describe('useActivityComments', () => {
  beforeEach(() => {
    h.invalidated.length = 0;
    h.toast.mockClear();
  });

  it('onSuccess confirms the reply and refreshes comments', async () => {
    renderHook(() => useActivityComments(['a1'], 'lead'));

    await act(async () => {
      await h.mutationOptions.addComment.onSuccess();
    });

    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reply added' }));
    expect(h.invalidated).toEqual(['getComments']);
  });
});

describe('useActivityReactions', () => {
  beforeEach(() => {
    h.invalidated.length = 0;
  });

  it('onSuccess stores the server-confirmed reactions and refreshes the cache', async () => {
    const { result } = renderHook(() => useActivityReactions(['a1'], 'lead', 'u1'));

    const reactions = [{ emoji: '👍', count: 1, users: ['u1'] }];
    await act(async () => {
      await h.mutationOptions.toggleReaction.onSuccess({ activityId: 'a1', reactions });
    });

    expect(h.invalidated).toEqual(['getReactions']);
    expect(result.current.reactions).toEqual({ a1: reactions });
  });
});
