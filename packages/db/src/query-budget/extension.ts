/**
 * Prisma 7 query-budget extension (ADR-053).
 *
 * A `$allOperations` query extension (the modern replacement for deprecated
 * `$use` middleware) that counts every Prisma operation against the active
 * request-scoped budget. It is a no-op when no budget context is active, so
 * seeds, migrations, and ad-hoc scripts are unaffected.
 *
 * Compose this AFTER the field-encryption extension in `client.ts` so it counts
 * every logical operation, including those on encrypted models:
 *
 *   client.$extends(fieldEncryptionExtension(...)).$extends(queryBudgetExtension())
 *
 * @module @intelliflow/db/query-budget/extension
 */

// NOTE: this module intentionally does NOT import from `../../generated/prisma`.
// tsup externalizes the generated-prisma specifier verbatim, and the flat dist/
// output requires `../generated` (one level), so a deep-nested generated import
// would resolve incorrectly at runtime. `$extends` accepts a plain extension
// object, so `Prisma.defineExtension` is unnecessary here.
import { getQueryBudgetStore, recordQuery } from './context';
import { reportOverBudget } from './reporter';

export interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Build a cheap, value-free structural fingerprint for an operation. Two
 * operations with the same fingerprint that fire repeatedly within one request
 * are the signature of an N+1 (same query shape issued per element). We hash
 * only the *shape* (top-level arg keys + where-clause keys), never values, to
 * keep this O(1)-ish and avoid leaking data.
 */
function fingerprint(model: string, operation: string, args: unknown): string {
  let shape = '';
  if (args && typeof args === 'object') {
    const a = args as Record<string, unknown>;
    const topKeys = Object.keys(a)
      .sort((x, y) => x.localeCompare(y))
      .join(',');
    let whereKeys = '';
    const where = a['where'];
    if (where && typeof where === 'object') {
      whereKeys = Object.keys(where as Record<string, unknown>)
        .sort((x, y) => x.localeCompare(y))
        .join(',');
    }
    shape = `${topKeys}|${whereKeys}`;
  }
  return `${model}.${operation}(${shape})`;
}

/**
 * The body of the `$allOperations` hook, extracted so it can be unit-tested
 * with a fake `query` thunk (no live database required).
 */
export async function instrumentOperation(params: AllOperationsArgs): Promise<unknown> {
  const { model, operation, args, query } = params;
  const store = getQueryBudgetStore();

  // Fast path: no active budget context (seeds / migrations / scripts).
  if (!store) {
    return query(args);
  }

  const modelName = model ?? '$raw';
  const start = performance.now();

  let result: unknown;
  let opError: unknown;
  let threw = false;
  try {
    result = await query(args);
  } catch (err) {
    threw = true;
    opError = err;
  }

  const durationMs = performance.now() - start;
  // A query was issued (even if it errored) — count it.
  recordQuery({
    model: modelName,
    action: operation,
    durationMs,
    fingerprint: fingerprint(modelName, operation, args),
  });

  // Never mask a real operation error behind a budget error.
  if (threw) {
    throw opError;
  }

  // Report/throw at most once per request, only after we tip over budget.
  // `reportOverBudget` throws ONLY in `throw` mode for non-background contexts
  // (tests); in observe/prod it just emits a structured event.
  if (store.count > store.budget && !store.reported) {
    store.reported = true;
    reportOverBudget(store, { model: modelName, action: operation, durationMs });
  }

  return result;
}

/**
 * Create the query-budget Prisma client extension as a plain extension object
 * (consumed by `client.$extends(...)` in client.ts). Returned untyped against
 * the Prisma extension args so it composes without importing the generated
 * client here; client.ts applies it.
 */
export function queryBudgetExtension() {
  return {
    name: 'query-budget',
    query: {
      $allOperations: (params: AllOperationsArgs) => instrumentOperation(params),
    },
  };
}
