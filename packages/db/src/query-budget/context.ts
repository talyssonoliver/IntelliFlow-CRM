/**
 * Request-scoped query-budget context (ADR-053).
 *
 * An AsyncLocalStorage store that lives in the infrastructure layer
 * (`packages/db`) so the Prisma query extension can count operations without
 * the domain/application layers gaining any dependency on it. The store is
 * *seeded* by the API tRPC tracing middleware (request context) and by the
 * ai-worker job entry (background context); it is a silent no-op everywhere
 * else (seeds, migrations, ad-hoc scripts) so those paths never crash.
 *
 * This is intentionally separate from `apps/api/src/tracing/correlation.ts`'s
 * AsyncLocalStorage: `packages/db` is the lowest layer and cannot import
 * `apps/api`. The middleware seeds this store with the requestId it already has.
 *
 * @module @intelliflow/db/query-budget/context
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Where the queries are being issued from. Background never throws on over-budget. */
export type QueryBudgetContextKind = 'request' | 'background' | 'unknown';

/** A single recorded Prisma operation. */
export interface QueryRecord {
  /** Prisma model name (camelCase as reported by the client), or `'$raw'` for raw SQL. */
  model: string;
  /** Prisma action: findMany / count / $queryRaw / etc. */
  action: string;
  /** Wall-clock duration of this single operation in milliseconds. */
  durationMs: number;
}

/** Mutable per-request/per-job accumulator. */
export interface QueryBudgetStore {
  requestId?: string;
  route?: string;
  method?: string;
  context: QueryBudgetContextKind;
  /** Max queries before the request is considered over budget. `Infinity` disables tripping. */
  budget: number;
  /** Total operations counted so far. */
  count: number;
  /** Every recorded operation (kept for snapshots / dev headers). */
  records: QueryRecord[];
  /**
   * Structural fingerprint -> occurrence count. A fingerprint repeated > 1 time
   * is the signature of an N+1 (the same shape of query issued per element).
   */
  fingerprints: Map<string, number>;
  /** Guard so a single request reports / throws at most once. */
  reported: boolean;
}

/** Seed values supplied by the seeding middleware / job entry. */
export interface QueryBudgetSeed {
  requestId?: string;
  route?: string;
  method?: string;
  context?: QueryBudgetContextKind;
  /** Defaults to {@link import('./config').DEFAULT_QUERY_BUDGET} when omitted by the caller. */
  budget: number;
}

/** Immutable view returned by {@link getQueryBudgetSnapshot}. */
export interface QueryBudgetSnapshot {
  requestId?: string;
  route?: string;
  method?: string;
  context: QueryBudgetContextKind;
  budget: number;
  count: number;
  exceeded: boolean;
  records: QueryRecord[];
  /** Fingerprints that fired more than once this request — the N+1 signatures. */
  repeated: Array<{ fingerprint: string; count: number }>;
}

const storage = new AsyncLocalStorage<QueryBudgetStore>();

/**
 * Run `fn` with a fresh query-budget store bound to the async context.
 * All Prisma operations issued (directly or transitively) inside `fn` are
 * counted against the seeded budget.
 */
export function runWithQueryBudget<T>(seed: QueryBudgetSeed, fn: () => T): T {
  const store: QueryBudgetStore = {
    requestId: seed.requestId,
    route: seed.route,
    method: seed.method,
    context: seed.context ?? 'unknown',
    budget: seed.budget,
    count: 0,
    records: [],
    fingerprints: new Map(),
    reported: false,
  };
  return storage.run(store, fn);
}

/** The active store, or `undefined` when called outside a seeded context. */
export function getQueryBudgetStore(): QueryBudgetStore | undefined {
  return storage.getStore();
}

/**
 * Record one Prisma operation against the active store.
 * Returns the store (for the extension's over-budget check) or `undefined`
 * when no context is active — in which case this is a complete no-op.
 */
export function recordQuery(
  rec: QueryRecord & { fingerprint?: string }
): QueryBudgetStore | undefined {
  const store = storage.getStore();
  if (!store) return undefined;
  store.count += 1;
  store.records.push({ model: rec.model, action: rec.action, durationMs: rec.durationMs });
  if (rec.fingerprint) {
    store.fingerprints.set(rec.fingerprint, (store.fingerprints.get(rec.fingerprint) ?? 0) + 1);
  }
  return store;
}

/** Snapshot the active store (e.g. for test assertions or dev response headers). */
export function getQueryBudgetSnapshot(): QueryBudgetSnapshot | undefined {
  const store = storage.getStore();
  if (!store) return undefined;
  return snapshotOf(store);
}

/** Build an immutable snapshot from a store instance. */
export function snapshotOf(store: QueryBudgetStore): QueryBudgetSnapshot {
  return {
    requestId: store.requestId,
    route: store.route,
    method: store.method,
    context: store.context,
    budget: store.budget,
    count: store.count,
    exceeded: store.count > store.budget,
    records: [...store.records],
    repeated: [...store.fingerprints.entries()]
      .filter(([, n]) => n > 1)
      .map(([fingerprint, count]) => ({ fingerprint, count })),
  };
}

/**
 * Test/measurement helper: run `fn` inside a query-budget context with an
 * effectively-unlimited budget (so it never trips), and return the operation
 * count + full snapshot. The canonical way to write an N+1 regression test:
 *
 *   const { count } = await measureQueries(() => service.listExperiments(tid));
 *   expect(count).toBeLessThanOrEqual(3); // not 3N+1
 */
export async function measureQueries<T>(
  fn: () => Promise<T>,
  opts?: { budget?: number; route?: string }
): Promise<{ result: T; count: number; snapshot: QueryBudgetSnapshot }> {
  let snapshot: QueryBudgetSnapshot | undefined;
  const result = await runWithQueryBudget(
    {
      budget: opts?.budget ?? Number.POSITIVE_INFINITY,
      context: 'request',
      route: opts?.route ?? 'measure',
    },
    async () => {
      const r = await fn();
      const store = storage.getStore();
      snapshot = store ? snapshotOf(store) : undefined;
      return r;
    }
  );
  // `snapshot` is always assigned inside the run callback above.
  return { result, count: snapshot!.count, snapshot: snapshot! };
}
