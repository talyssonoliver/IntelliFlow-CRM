/**
 * Query-budget reporter (ADR-053).
 *
 * Emits a structured event when a request exceeds its query budget and, in
 * `throw` mode (tests), raises {@link QueryBudgetExceededError}. Background
 * contexts NEVER throw regardless of mode.
 *
 * The default emitter logs a single structured JSON line. The app layer can
 * override it via {@link setQueryBudgetEmitter} to forward to OpenTelemetry
 * (`intelliflow.db.query.count`) without `packages/db` depending on the
 * observability package.
 *
 * @module @intelliflow/db/query-budget/reporter
 */

import type { QueryBudgetStore, QueryRecord } from './context';
import { resolveMode, type QueryBudgetMode } from './config';

/** Error thrown in `throw` mode when a (non-background) request exceeds budget. */
export class QueryBudgetExceededError extends Error {
  readonly code = 'QUERY_BUDGET_EXCEEDED' as const;
  readonly requestId?: string;
  readonly route?: string;
  readonly queryCount: number;
  readonly queryBudget: number;

  constructor(detail: {
    requestId?: string;
    route?: string;
    queryCount: number;
    queryBudget: number;
  }) {
    super(
      `Query budget exceeded: ${detail.queryCount} queries > budget ${detail.queryBudget}` +
        (detail.route ? ` on ${detail.route}` : '') +
        '. Likely an N+1 — batch the per-element query (see NPLUS1_AUDIT.md).'
    );
    this.name = 'QueryBudgetExceededError';
    this.requestId = detail.requestId;
    this.route = detail.route;
    this.queryCount = detail.queryCount;
    this.queryBudget = detail.queryBudget;
  }
}

/** Structured over-budget event shape. */
export interface QueryBudgetEvent {
  type: 'query-budget.exceeded';
  requestId?: string;
  route?: string;
  method?: string;
  context: string;
  queryCount: number;
  queryBudget: number;
  exceeded: true;
  model: string;
  action: string;
  durationMs: number;
  /** The N+1 signature: a structural fingerprint repeated this many times. */
  repeatedQueryFingerprint?: string;
  repeatedQueryCount?: number;
  timestamp: string;
  environment: string;
}

export type QueryBudgetEmitter = (event: QueryBudgetEvent) => void;

/** Default emitter: a single structured warning line. */
const defaultEmitter: QueryBudgetEmitter = (event) => {
  console.warn(JSON.stringify(event));
};

let emitter: QueryBudgetEmitter = defaultEmitter;

/** Override the emitter (e.g. to forward to OpenTelemetry). Returns a restore fn. */
export function setQueryBudgetEmitter(fn: QueryBudgetEmitter): () => void {
  const previous = emitter;
  emitter = fn;
  return () => {
    emitter = previous;
  };
}

/** Reset to the default emitter (used by tests). */
export function resetQueryBudgetEmitter(): void {
  emitter = defaultEmitter;
}

/**
 * Report an over-budget request. Emits the structured event and, in `throw`
 * mode for non-background contexts, throws {@link QueryBudgetExceededError}.
 *
 * Callers gate this behind `store.count > store.budget && !store.reported`.
 */
export function reportOverBudget(
  store: QueryBudgetStore,
  last: QueryRecord,
  opts?: { mode?: QueryBudgetMode; now?: () => string; env?: string }
): void {
  const mode = opts?.mode ?? resolveMode();
  if (mode === 'off') return;

  const topRepeated = mostRepeated(store);
  const event: QueryBudgetEvent = {
    type: 'query-budget.exceeded',
    requestId: store.requestId,
    route: store.route,
    method: store.method,
    context: store.context,
    queryCount: store.count,
    queryBudget: store.budget,
    exceeded: true,
    model: last.model,
    action: last.action,
    durationMs: last.durationMs,
    repeatedQueryFingerprint: topRepeated?.fingerprint,
    repeatedQueryCount: topRepeated?.count,
    timestamp: opts?.now ? opts.now() : new Date().toISOString(),
    environment: opts?.env ?? process.env['NODE_ENV'] ?? 'unknown',
  };

  emitter(event);

  // Background work must never throw — it would crash a BullMQ worker.
  if (mode === 'throw' && store.context !== 'background') {
    throw new QueryBudgetExceededError({
      requestId: store.requestId,
      route: store.route,
      queryCount: store.count,
      queryBudget: store.budget,
    });
  }
}

function mostRepeated(store: QueryBudgetStore): { fingerprint: string; count: number } | undefined {
  let best: { fingerprint: string; count: number } | undefined;
  for (const [fingerprint, count] of store.fingerprints) {
    if (count > 1 && (!best || count > best.count)) best = { fingerprint, count };
  }
  return best;
}
