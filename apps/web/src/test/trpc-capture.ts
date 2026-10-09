/**
 * Test helper: a tRPC client double that records what components hand to it.
 *
 * - `useMutation(options)` stores the options by procedure path so a test can
 *   invoke `onSuccess` / `onError` directly.
 * - `useUtils()` returns a proxy whose `<path>.invalidate()` calls are recorded.
 * - `useQuery()` returns `capture.queryData[path]` (undefined by default).
 *
 * The module is a singleton, so the instance a `vi.mock` factory imports is the
 * same one the test file imports.
 */
import { vi } from 'vitest';

export interface MutationOptions {
  onSuccess?: (...args: unknown[]) => unknown;
  onError?: (...args: unknown[]) => unknown;
}

export const capture = {
  mutations: {} as Record<string, MutationOptions>,
  invalidations: [] as string[],
  queryData: {} as Record<string, unknown>,
  /** When set, every `invalidate()` rejects with this value. */
  invalidateError: undefined as unknown,
  mutate: vi.fn(),
  reset() {
    this.mutations = {};
    this.invalidations = [];
    this.queryData = {};
    this.invalidateError = undefined;
    this.mutate.mockReset();
  },
};

function buildProxy(path: string[], utils: boolean): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') return undefined;
      const joined = path.join('.');
      if (!utils && prop === 'useMutation') {
        return (options: MutationOptions) => {
          capture.mutations[joined] = options;
          return {
            mutate: capture.mutate,
            mutateAsync: capture.mutate,
            isPending: false,
            isLoading: false,
          };
        };
      }
      if (!utils && prop === 'useQuery') {
        return () => ({
          data: capture.queryData[joined],
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        });
      }
      if (utils && prop === 'invalidate') {
        return () => {
          capture.invalidations.push(joined);
          return capture.invalidateError === undefined
            ? Promise.resolve()
            : Promise.reject(capture.invalidateError);
        };
      }
      return buildProxy([...path, prop], utils);
    },
  });
}

/** Drop-in for `trpc` / `api` from `@/lib/trpc` and `@/lib/api`. */
export const trpcCaptureClient = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'useUtils') return () => buildProxy([], true);
      return buildProxy([prop], false);
    },
  }
);
