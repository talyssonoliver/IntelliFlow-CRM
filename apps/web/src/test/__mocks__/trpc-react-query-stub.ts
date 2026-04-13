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
      // Coerce to primitives cleanly so template literals / string(+)/Number()
      // don't throw "Cannot convert object to primitive value" when UI code
      // reads a proxy property it assumed was a string/number.
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return undefined;
      if (prop === 'toString' || prop === 'valueOf') return () => '';
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
