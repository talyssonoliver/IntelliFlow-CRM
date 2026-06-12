/**
 * Test stub for @intelliflow/observability.
 *
 * The observability package has no built dist in dev/CI test environments.
 * This stub satisfies the two symbols imported by worker-shared source files
 * so that vitest can resolve the module without building the full package.
 */

 
export function getCurrentLogContext(): any {
  return {};
}

 
export function runWithLogContext(_ctx: unknown, fn: () => any): any {
  return fn();
}

export type LogRequestContext = Record<string, unknown>;
