/**
 * AsyncLocalStorage-based log context for pino mixin
 *
 * Provides request-scoped structured fields (correlationId, tenantId, userId,
 * traceId) that are automatically merged into every pino log line via mixin.
 *
 * Usage:
 *   - Call `runWithLogContext({ correlationId, tenantId, userId }, fn)` at the
 *     boundary of a BullMQ job handler or tRPC middleware to bind context.
 *   - Wire `pino({ mixin: () => getCurrentLogContext() ?? {} })` at logger
 *     construction to propagate fields automatically.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Fields that can be bound into the log context for a request/job scope.
 */
export interface LogRequestContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
}

const storage = new AsyncLocalStorage<LogRequestContext>();

/**
 * Run `fn` inside a log context scope.
 * Every pino log emitted within `fn` (including any async sub-calls) will
 * automatically include the provided fields.
 *
 * @param context - Fields to merge into every log line
 * @param fn - Work to perform inside the scope
 * @returns The return value of `fn`
 */
export function runWithLogContext<T>(context: LogRequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Read the current log context from AsyncLocalStorage.
 * Returns `null` when called outside a `runWithLogContext` scope.
 */
export function getCurrentLogContext(): LogRequestContext | null {
  return storage.getStore() ?? null;
}
