/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidated: string[] = [];
  const failure = { error: null as Error | null };
  const onDataHandlers: Array<() => void> = [];

  const utils = {
    activityFeed: {
      getUnifiedFeed: {
        invalidate: () => {
          invalidated.push('getUnifiedFeed');
          return failure.error ? Promise.reject(failure.error) : Promise.resolve();
        },
      },
      getEntityFeed: {
        invalidate: () => {
          invalidated.push('getEntityFeed');
          return failure.error ? Promise.reject(failure.error) : Promise.resolve();
        },
      },
    },
  };

  const infiniteQuery = () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: undefined,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });

  const subscription = (opts: { onData: () => void }) => {
    onDataHandlers.push(opts.onData);
  };

  return { invalidated, failure, onDataHandlers, utils, infiniteQuery, subscription };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => h.utils,
    activityFeed: {
      getUnifiedFeed: { useInfiniteQuery: () => h.infiniteQuery() },
      getEntityFeed: { useInfiniteQuery: () => h.infiniteQuery() },
    },
  },
}));

vi.mock('@/hooks/use-trpc-subscriptions', () => ({
  useLeadScoredSubscription: h.subscription,
  useTaskAssignedSubscription: h.subscription,
  useSystemEventSubscription: h.subscription,
}));

import { useActivityFeed, useEntityFeed } from '../useActivityFeed';

describe('activity feed debounced invalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.invalidated.length = 0;
    h.onDataHandlers.length = 0;
    h.failure.error = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('useActivityFeed invalidates the unified feed once after the debounce window', () => {
    renderHook(() => useActivityFeed());

    act(() => {
      // Several events in a burst collapse into a single invalidation.
      h.onDataHandlers[0]();
      h.onDataHandlers[1]();
      h.onDataHandlers[2]();
    });
    expect(h.invalidated).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(h.invalidated).toEqual(['getUnifiedFeed']);
  });

  it('useEntityFeed invalidates the entity feed after the debounce window', () => {
    renderHook(() => useEntityFeed({ entityType: 'LEAD', entityId: 'l1' }));

    act(() => {
      h.onDataHandlers[0]();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(h.invalidated).toEqual(['getEntityFeed']);
  });

  it('useActivityFeed logs when the debounced invalidation rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('network down');
    h.failure.error = failure;
    renderHook(() => useActivityFeed());

    act(() => {
      h.onDataHandlers[0]();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(errorSpy).toHaveBeenCalledWith('[useActivityFeed] Failed to refresh the feed:', failure);
  });

  it('useEntityFeed logs when the debounced invalidation rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('network down');
    h.failure.error = failure;
    renderHook(() => useEntityFeed({ entityType: 'LEAD', entityId: 'l1' }));

    act(() => {
      h.onDataHandlers[0]();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(errorSpy).toHaveBeenCalledWith('[useEntityFeed] Failed to refresh the feed:', failure);
  });
});
