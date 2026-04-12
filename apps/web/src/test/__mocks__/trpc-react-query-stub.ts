/**
 * Stub for @trpc/react-query in test environments.
 *
 * Exports createTRPCReact as a function that returns a recursive Proxy,
 * so trpc.ts can call createTRPCReact() at module scope without crashing.
 *
 * Tests that need specific tRPC behavior should still mock @/lib/trpc:
 *   vi.mock('@/lib/trpc', () => ({ trpc: { ... } }))
 */

function makeProxy(): unknown {
  return new Proxy(function () {}, {
    get(_target, prop) {
      // Exclude 'then' so the proxy is not treated as a thenable by await,
      // which would cause infinite hangs.
      if (prop === 'then') return undefined;
      return makeProxy();
    },
    apply() {
      return makeProxy();
    },
  });
}

export function createTRPCReact() {
  return makeProxy();
}

export default {};
