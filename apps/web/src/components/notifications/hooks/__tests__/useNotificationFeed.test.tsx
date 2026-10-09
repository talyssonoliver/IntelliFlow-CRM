/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidated: string[] = [];
  const failure = { error: undefined as unknown };
  const handlers: Array<() => void> = [];
  const utils = {
    notifications: {
      list: {
        invalidate: () => {
          invalidated.push('list');
          return failure.error === undefined ? Promise.resolve() : Promise.reject(failure.error);
        },
      },
      getUnreadCount: {
        invalidate: () => {
          invalidated.push('getUnreadCount');
          return Promise.resolve();
        },
      },
    },
  };
  return { invalidated, handlers, utils, failure };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => h.utils,
    notifications: {
      list: {
        useInfiniteQuery: () => ({
          data: undefined,
          isLoading: false,
          isError: false,
          error: null,
          isFetchingNextPage: false,
          hasNextPage: undefined,
          fetchNextPage: vi.fn(),
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock('../useNotificationSubscription', () => ({
  useNotificationSubscription: (opts: { onData: () => void }) => {
    h.handlers.push(opts.onData);
  },
}));

import { useNotificationFeed } from '../useNotificationFeed';

describe('useNotificationFeed invalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.invalidated.length = 0;
    h.handlers.length = 0;
    h.failure.error = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the list and unread count once after the debounce window', () => {
    renderHook(() =>
      useNotificationFeed({
        searchQuery: '',
        typeFilter: '',
        priorityFilter: '',
        activeTab: 'all',
      } as never)
    );

    act(() => {
      h.handlers[0]();
      h.handlers[0]();
    });
    expect(h.invalidated).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(h.invalidated).toEqual(['list', 'getUnreadCount']);
  });

  it('logs instead of leaving an unhandled rejection when the refresh fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('refetch failed');
    h.failure.error = boom;
    renderHook(() =>
      useNotificationFeed({
        searchQuery: '',
        typeFilter: '',
        priorityFilter: '',
        activeTab: 'all',
      } as never)
    );

    act(() => {
      h.handlers[0]();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[useNotificationFeed] Failed to refresh the notification feed:',
      boom
    );
    errorSpy.mockRestore();
  });
});
