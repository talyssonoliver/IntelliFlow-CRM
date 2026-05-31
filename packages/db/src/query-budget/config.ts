/**
 * Query-budget configuration (ADR-053).
 *
 * - Default per-request budget: 15 queries.
 * - Mode: `off` (disabled), `observe` (warn-only — production/dev default),
 *   `throw` (test default — lets regression tests assert the guard fires).
 * - Per-route overrides: ONLY with a documented justification. Raising a budget
 *   to mask an un-fixed N+1 is prohibited (see NPLUS1_AUDIT.md §5).
 *
 * @module @intelliflow/db/query-budget/config
 */

export type QueryBudgetMode = 'off' | 'observe' | 'throw';

/** The default per-request query budget. */
export const DEFAULT_QUERY_BUDGET = 15;

/**
 * Resolve the detector mode.
 *
 * Default is `observe` (report-only) in EVERY environment — including test —
 * so the live middleware never throws inside the general test suite or blocks
 * a production request. `throw` is strictly opt-in via `QUERY_BUDGET_MODE=throw`
 * (e.g. a dedicated CI guard job). N+1 regression tests assert query COUNT via
 * `measureQueries` (budget = Infinity, never throws) rather than relying on the
 * guard firing.
 */
export function resolveMode(env: NodeJS.ProcessEnv = process.env): QueryBudgetMode {
  const explicit = env['QUERY_BUDGET_MODE'];
  if (explicit === 'off' || explicit === 'observe' || explicit === 'throw') {
    return explicit;
  }
  return 'observe';
}

/**
 * Per-route budget overrides. Key = the `route` string seeded by the middleware
 * (e.g. `trpc.query.activityFeed.getUnifiedFeed`). Each entry REQUIRES an inline
 * justification comment and an accompanying test asserting the documented count.
 *
 * Intentionally empty by default — the remediation batches fix the query, they
 * do not raise the budget.
 */
export const ROUTE_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  // Example (commented — enable only with sign-off + a test):
  // Activity-feed unified view legitimately fans out to <=7 source tables in
  // parallel (NPLUS1_AUDIT.md NP-044 — a connection-pool concern, not a
  // data-scaling N+1). If kept as a parallel fan-out, document the override:
  // 'trpc.query.activityFeed.getUnifiedFeed': 9,
});

/** Resolve the budget for a route, falling back to the default. */
export function budgetForRoute(
  route: string | undefined,
  fallback: number = DEFAULT_QUERY_BUDGET
): number {
  if (!route) return fallback;
  return ROUTE_BUDGETS[route] ?? fallback;
}

/**
 * Background jobs (BullMQ sweeps) legitimately issue more queries than a single
 * request, so they get a separate, generous budget. Over-budget background work
 * is reported (warn-only) but NEVER thrown — `context: 'background'` short-circuits
 * the throw path in the reporter. Override via `QUERY_BUDGET_BACKGROUND`.
 */
export const DEFAULT_BACKGROUND_QUERY_BUDGET = 50;

export function resolveBackgroundBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['QUERY_BUDGET_BACKGROUND'];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_BACKGROUND_QUERY_BUDGET;
}
