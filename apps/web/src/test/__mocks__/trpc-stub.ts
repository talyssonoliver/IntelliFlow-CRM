/**
 * Minimal tRPC stub for test environments.
 *
 * Prevents loading the entire @trpc/react-query + @tanstack/react-query
 * module graph, which initializes QueryClient with timers and window event
 * listeners that prevent GC between tests (causing OOM in isolated runs).
 *
 * Tests that need tRPC behavior must mock @/lib/trpc with vi.mock():
 *   vi.mock('@/lib/trpc', () => ({ trpc: { ... } }))
 *
 * This stub is only reached if vi.mock('@/lib/trpc') is NOT used.
 */

// Minimal no-op tRPC proxy — returns undefined for all property chains.
// Using a Proxy so any chain like trpc.auth.verifyMfa.useMutation()
// returns undefined rather than throwing.
function makeProxy(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_target, _prop) {
        return makeProxy();
      },
      apply() {
        return undefined;
      },
    }
  ) as Record<string, unknown>;
}

export const trpc = makeProxy();
