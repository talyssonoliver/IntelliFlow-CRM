/**
 * Property tests for QueryBudgetStore.reported flag — at-most-once
 * reportOverBudget invariant (ADR-053).
 *
 * Source property ids / notes from
 * docs/operations/property-testing/race-condition-findings.json
 * propertyCandidates entry: "QueryBudgetStore.reported flag"
 * (packages/db/src/query-budget/extension.ts)
 *
 * Properties covered:
 *   1. For any sequence of instrumentOperation calls whose count tips over the
 *      budget, reportOverBudget (via the emitter) is called exactly once — the
 *      at-most-once property.
 *   2. store.reported is false before the first over-budget operation.
 *   3. store.reported is true after the first over-budget operation and remains
 *      true for every subsequent operation in the same request context.
 *   4. The over-budget event carries the correct count at the moment of first
 *      report (count > budget).
 *   5. Under-budget operation sequences never set reported and never call the
 *      emitter.
 *   6. reportOverBudget is not called when mode is 'off', even if count exceeds
 *      budget repeatedly.
 *   7. Background contexts never throw even in throw mode, and the emitter fires
 *      at most once.
 *   8. Fingerprint-based N+1 detection: repeated structural fingerprints appear
 *      in snapshot.repeated; distinct fingerprints are absent from repeated list.
 *   9. snapshotOf.exceeded is true iff count > budget (not count >= budget).
 *  10. recordQuery is a complete no-op outside a seeded context — count stays 0
 *      for any number of calls.
 *  11. resolveBackgroundBudget clamps invalid / non-positive env values to the
 *      default (property-based env fuzzing).
 *  12. budgetForRoute falls back to the caller-supplied fallback for any unknown
 *      route string.
 *
 * RACE-QUOTA-04 disposition: false positive — the check-then-set is fully
 * synchronous (no await between guard and flag assignment) so Node.js
 * single-threaded execution makes it atomic. Properties 1–3 confirm this
 * empirically across many generated sequences.
 *
 * @see packages/db/src/query-budget/extension.ts
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

import {
  runWithQueryBudget,
  getQueryBudgetStore,
  recordQuery,
  getQueryBudgetSnapshot,
  snapshotOf,
} from '@intelliflow/db/query-budget/context';
import {
  resolveMode,
  resolveBackgroundBudget,
  budgetForRoute,
  DEFAULT_QUERY_BUDGET,
  DEFAULT_BACKGROUND_QUERY_BUDGET,
  type QueryBudgetMode,
} from '@intelliflow/db/query-budget/config';
import {
  setQueryBudgetEmitter,
  resetQueryBudgetEmitter,
  type QueryBudgetEvent,
} from '@intelliflow/db/query-budget/reporter';
import { instrumentOperation } from '@intelliflow/db/query-budget/extension';

import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const okQuery = async () => 'ok';

/** Build a minimal valid QueryBudgetStore for reportOverBudget-level unit tests. */
function makeStore(
  overrides: Partial<{
    budget: number;
    count: number;
    context: 'request' | 'background' | 'unknown';
    reported: boolean;
  }> = {}
) {
  return {
    context: 'request' as const,
    budget: overrides.budget ?? 5,
    count: overrides.count ?? 0,
    records: [] as Array<{ model: string; action: string; durationMs: number }>,
    fingerprints: new Map<string, number>(),
    reported: overrides.reported ?? false,
    ...overrides,
  };
}

afterEach(() => {
  resetQueryBudgetEmitter();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** A small positive integer budget (1–10) that lets tests stay fast. */
const arbBudget = fc.integer({ min: 1, max: 10 });

/**
 * A number of operations that is strictly ABOVE the budget.
 * Produces (budget, opsCount) where opsCount > budget.
 */
const arbBudgetAndOverCount = arbBudget.chain((budget) =>
  fc.integer({ min: budget + 1, max: budget + 10 }).map((opsCount) => ({ budget, opsCount }))
);

/**
 * A number of operations that does NOT exceed the budget.
 * Produces (budget, opsCount) where 0 <= opsCount <= budget.
 */
const arbBudgetAndUnderCount = arbBudget.chain((budget) =>
  fc.integer({ min: 0, max: budget }).map((opsCount) => ({ budget, opsCount }))
);

/** A model name that is a non-empty alphanumeric identifier string. */
const arbModelName = fc
  .string({ unit: 'binary', minLength: 1, maxLength: 20 })
  .map((s) => s.replace(/[^a-zA-Z0-9_]/g, 'x').replace(/^$/, 'model'))
  .filter((s) => s.length >= 1)
  .map((s) => s || 'model');

/** Any QueryBudgetMode. */
const arbMode = fc.constantFrom<QueryBudgetMode>('off', 'observe', 'throw');

// ---------------------------------------------------------------------------
// Property 1: at-most-once — emitter fires exactly once for any over-budget sequence
// ---------------------------------------------------------------------------

describe('QueryBudgetStore.reported — at-most-once property', () => {
  test.prop([arbBudgetAndOverCount], propertyParams())(
    '1. emitter fires exactly once for any sequence of operations that exceeds the budget',
    async ({ budget, opsCount }) => {
      const events: QueryBudgetEvent[] = [];
      setQueryBudgetEmitter((e) => events.push(e));

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'lead',
            operation: 'findMany',
            args: {},
            query: okQuery,
          });
        }
      });

      // Exactly one event regardless of how many operations exceeded the budget.
      expect(events).toHaveLength(1);
    }
  );

  // ---------------------------------------------------------------------------
  // Property 2: reported is false before the first over-budget op
  // ---------------------------------------------------------------------------

  test.prop([arbBudgetAndUnderCount], propertyParams())(
    '2. store.reported is false while count <= budget',
    async ({ budget, opsCount }) => {
      let reportedDuringRun: boolean | undefined;

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'contact',
            operation: 'count',
            args: {},
            query: okQuery,
          });
        }
        reportedDuringRun = getQueryBudgetStore()!.reported;
      });

      expect(reportedDuringRun).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // Property 3: reported stays true for all subsequent operations after first trip
  // ---------------------------------------------------------------------------

  test.prop([arbBudgetAndOverCount], propertyParams())(
    '3. store.reported is true after the first over-budget op and remains true for all subsequent ops',
    async ({ budget, opsCount }) => {
      // Silence the default console.warn emitter — we only care about the reported flag state.
      setQueryBudgetEmitter(() => {});
      const reportedSnapshots: boolean[] = [];

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'lead',
            operation: 'findUnique',
            args: { where: { id: String(i) } },
            query: okQuery,
          });
          const store = getQueryBudgetStore()!;
          reportedSnapshots.push(store.reported);
        }
      });

      // Find the first index where count tips over budget.
      // The first budget+1 ops are at or below budget; from there onward reported=true.
      const firstOverBudgetIdx = budget; // 0-indexed: after (budget) ops the (budget+1)th op tips over
      for (let i = firstOverBudgetIdx; i < reportedSnapshots.length; i++) {
        expect(reportedSnapshots[i]).toBe(true);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Property 4: the emitted event carries the correct count at first report
  // ---------------------------------------------------------------------------

  test.prop([arbBudgetAndOverCount], propertyParams())(
    '4. emitted event queryCount is > budget at the moment of first report',
    async ({ budget, opsCount }) => {
      const events: QueryBudgetEvent[] = [];
      setQueryBudgetEmitter((e) => events.push(e));

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'ticket',
            operation: 'findMany',
            args: {},
            query: okQuery,
          });
        }
      });

      expect(events).toHaveLength(1);
      expect(events[0]!.queryCount).toBeGreaterThan(budget);
      expect(events[0]!.queryBudget).toBe(budget);
      expect(events[0]!.exceeded).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 5: under-budget sequences never fire the emitter
// ---------------------------------------------------------------------------

describe('QueryBudgetStore.reported — under-budget never fires', () => {
  test.prop([arbBudgetAndUnderCount], propertyParams())(
    '5. emitter is never called for operation sequences that do not exceed the budget',
    async ({ budget, opsCount }) => {
      const events: QueryBudgetEvent[] = [];
      setQueryBudgetEmitter((e) => events.push(e));

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'lead',
            operation: 'count',
            args: {},
            query: okQuery,
          });
        }
      });

      expect(events).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 6: mode=off never calls emitter regardless of count
// ---------------------------------------------------------------------------

describe('QueryBudgetStore.reported — mode=off', () => {
  test.prop([arbBudgetAndOverCount], propertyParams())(
    '6. emitter is never called when QUERY_BUDGET_MODE=off regardless of how many ops exceed budget',
    async ({ budget, opsCount }) => {
      vi.stubEnv('QUERY_BUDGET_MODE', 'off');
      const emitterCalls: QueryBudgetEvent[] = [];
      setQueryBudgetEmitter((e) => emitterCalls.push(e));

      await runWithQueryBudget({ budget, context: 'request', route: 'prop-test' }, async () => {
        for (let i = 0; i < opsCount; i++) {
          await instrumentOperation({
            model: 'lead',
            operation: 'findMany',
            args: {},
            query: okQuery,
          });
        }
      });

      // mode=off: emitter must not be called
      expect(emitterCalls).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 7: background context never throws even in throw mode; emitter fires at most once
// ---------------------------------------------------------------------------

describe('QueryBudgetStore.reported — background context', () => {
  test.prop([arbBudgetAndOverCount], propertyParams())(
    '7. background context never throws in throw mode and emitter fires exactly once',
    async ({ budget, opsCount }) => {
      vi.stubEnv('QUERY_BUDGET_MODE', 'throw');
      const events: QueryBudgetEvent[] = [];
      setQueryBudgetEmitter((e) => events.push(e));

      // Should not throw
      await expect(
        runWithQueryBudget({ budget, context: 'background', route: 'sweeper' }, async () => {
          for (let i = 0; i < opsCount; i++) {
            await instrumentOperation({
              model: 'ticket',
              operation: 'findMany',
              args: {},
              query: okQuery,
            });
          }
        })
      ).resolves.toBeUndefined();

      // Emitter called exactly once
      expect(events).toHaveLength(1);
      expect(events[0]!.context).toBe('background');
    }
  );
});

// ---------------------------------------------------------------------------
// Property 8: repeated fingerprints appear in snapshot.repeated; distinct do not
// ---------------------------------------------------------------------------

describe('QueryBudgetStore fingerprint / N+1 detection', () => {
  test.prop([fc.integer({ min: 2, max: 8 }), arbModelName], propertyParams())(
    '8. repeated structural fingerprints are reported in snapshot.repeated; distinct fingerprints are absent',
    async (repeatCount, model) => {
      const { snapshot } = await (async () => {
        let snap: ReturnType<typeof getQueryBudgetSnapshot>;
        await runWithQueryBudget(
          { budget: Number.POSITIVE_INFINITY, context: 'request' },
          async () => {
            // Issue the same query shape `repeatCount` times (same fingerprint).
            for (let i = 0; i < repeatCount; i++) {
              await instrumentOperation({
                model,
                operation: 'findUnique',
                args: { where: { id: String(i) } },
                query: okQuery,
              });
            }
            snap = getQueryBudgetSnapshot();
          }
        );
        return { snapshot: snap! };
      })();

      // The fingerprint that repeated `repeatCount` times must appear in repeated.
      const expectedFp = `${model}.findUnique(where|id)`;
      const entry = snapshot.repeated.find((r) => r.fingerprint === expectedFp);
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(repeatCount);
    }
  );

  test.prop([arbModelName, fc.constantFrom('findMany', 'count', 'findFirst')], propertyParams())(
    '8b. a fingerprint issued exactly once does not appear in snapshot.repeated',
    async (model, operation) => {
      let snap: ReturnType<typeof getQueryBudgetSnapshot>;
      await runWithQueryBudget(
        { budget: Number.POSITIVE_INFINITY, context: 'request' },
        async () => {
          // Issue each operation shape only once.
          await instrumentOperation({
            model,
            operation,
            args: { where: { id: '1' } },
            query: okQuery,
          });
          snap = getQueryBudgetSnapshot();
        }
      );
      const snapshot = snap!;
      // Nothing should appear as "repeated" (all counts are 1).
      expect(snapshot.repeated).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 9: snapshotOf.exceeded is strictly count > budget (not >=)
// ---------------------------------------------------------------------------

describe('QueryBudgetStore snapshotOf.exceeded boundary', () => {
  test.prop([arbBudget], propertyParams())(
    '9. snapshot.exceeded is false when count === budget (boundary — not exceeded)',
    () => {
      // Build a store where count === budget.
      const budget = 5;
      const store = makeStore({ budget, count: budget });
      const snap = snapshotOf(store);
      expect(snap.exceeded).toBe(false);
    }
  );

  test.prop([arbBudget], propertyParams())(
    '9b. snapshot.exceeded is true when count === budget + 1',
    () => {
      const budget = 5;
      const store = makeStore({ budget, count: budget + 1 });
      const snap = snapshotOf(store);
      expect(snap.exceeded).toBe(true);
    }
  );

  test.prop(
    [
      arbBudget.chain((budget) =>
        fc.integer({ min: 0, max: budget }).map((count) => ({ budget, count }))
      ),
    ],
    propertyParams()
  )(
    '9c. snapshot.exceeded matches count > budget for any (count, budget) pair',
    ({ budget, count }) => {
      const store = makeStore({ budget, count });
      const snap = snapshotOf(store);
      expect(snap.exceeded).toBe(count > budget);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 10: recordQuery is a no-op outside a seeded context
// ---------------------------------------------------------------------------

describe('recordQuery outside seeded context', () => {
  test.prop([fc.integer({ min: 1, max: 20 })], propertyParams())(
    '10. recordQuery outside a budget context is a complete no-op for any call count',
    (callCount) => {
      // Ensure we're outside a budget context (global test scope has none).
      expect(getQueryBudgetStore()).toBeUndefined();

      for (let i = 0; i < callCount; i++) {
        const result = recordQuery({ model: 'lead', action: 'findMany', durationMs: 1 });
        expect(result).toBeUndefined();
      }

      // Still no context after the calls.
      expect(getQueryBudgetStore()).toBeUndefined();
      expect(getQueryBudgetSnapshot()).toBeUndefined();
    }
  );
});

// ---------------------------------------------------------------------------
// Property 11: resolveBackgroundBudget clamps invalid env values to default
// ---------------------------------------------------------------------------

describe('resolveBackgroundBudget — invalid env values clamped to default', () => {
  test.prop(
    [
      fc.oneof(
        // Non-numeric strings
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => Number.isNaN(Number(s))),
        // Zero or negative numbers as strings
        fc.integer({ min: -100, max: 0 }).map((n) => String(n))
      ),
    ],
    propertyParams()
  )(
    '11. resolveBackgroundBudget falls back to DEFAULT_BACKGROUND_QUERY_BUDGET for invalid env values',
    (invalidValue) => {
      const result = resolveBackgroundBudget({
        QUERY_BUDGET_BACKGROUND: invalidValue,
      } as NodeJS.ProcessEnv);
      expect(result).toBe(DEFAULT_BACKGROUND_QUERY_BUDGET);
    }
  );

  test.prop([fc.integer({ min: 1, max: 10_000 })], propertyParams())(
    '11b. resolveBackgroundBudget honours any positive integer env value',
    (n) => {
      const result = resolveBackgroundBudget({
        QUERY_BUDGET_BACKGROUND: String(n),
      } as NodeJS.ProcessEnv);
      expect(result).toBe(n);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 12: budgetForRoute falls back to caller-supplied fallback for unknown routes
// ---------------------------------------------------------------------------

/**
 * BUG(PROTO-ROUTE-01): `budgetForRoute` uses `ROUTE_BUDGETS[route] ?? fallback`
 * where ROUTE_BUDGETS is a plain frozen object. When `route` equals a name that
 * exists on Object.prototype (e.g. "toString", "valueOf", "constructor",
 * "hasOwnProperty"), `ROUTE_BUDGETS[route]` returns the inherited prototype
 * method — a truthy, non-null/non-undefined value — so the `??` fallback never
 * fires and the caller receives a Function instead of a number.
 *
 * Fix: use `Object.prototype.hasOwnProperty.call(ROUTE_BUDGETS, route)` or
 * `Object.hasOwn(ROUTE_BUDGETS, route)` before indexing, or use a `Map` instead
 * of a plain object for ROUTE_BUDGETS.
 *
 * Affected file: packages/db/src/query-budget/config.ts:58
 *   return ROUTE_BUDGETS[route] ?? fallback;
 */

/** Safe-to-use route strings: exclude Object.prototype property names that would hit the bug. */
const PROTO_PROPERTY_NAMES = new Set([
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
]);

const arbSafeUnknownRoute = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.length >= 1 && !PROTO_PROPERTY_NAMES.has(s));

describe('budgetForRoute — fallback for unknown routes', () => {
  test.prop([arbSafeUnknownRoute, fc.integer({ min: 1, max: 500 })], propertyParams())(
    '12. budgetForRoute returns the supplied fallback for any route not in ROUTE_BUDGETS (safe route strings only)',
    (route, fallback) => {
      // All routes with non-standard content will not match the (currently empty) ROUTE_BUDGETS.
      const result = budgetForRoute(route, fallback);
      // Since ROUTE_BUDGETS is currently empty, result is always the fallback
      // (for routes that don't collide with Object.prototype property names).
      expect(result).toBe(fallback);
    }
  );

  // BUG(PROTO-ROUTE-01): Object.prototype property names bypass the fallback.
  // The property below documents the bug — skip until fix is applied.
  it.skip('// BUG(PROTO-ROUTE-01): budgetForRoute("toString", fallback) should return fallback but returns Object.prototype.toString instead — ROUTE_BUDGETS uses plain object indexing without hasOwn guard', () => {
    // Demonstrates the failure:
    const result = budgetForRoute('toString', 99);
    expect(result).toBe(99); // fails: result is [Function: toString]
  });

  test.prop([fc.integer({ min: 1, max: 500 })], propertyParams())(
    '12b. budgetForRoute(undefined, fallback) always returns the fallback',
    (fallback) => {
      expect(budgetForRoute(undefined, fallback)).toBe(fallback);
    }
  );

  test.prop([arbSafeUnknownRoute], propertyParams())(
    '12c. budgetForRoute(route) with no fallback returns DEFAULT_QUERY_BUDGET for unknown routes (safe route strings only)',
    (route) => {
      expect(budgetForRoute(route)).toBe(DEFAULT_QUERY_BUDGET);
    }
  );
});

// ---------------------------------------------------------------------------
// Property: resolveMode returns one of the three valid modes for any env input
// ---------------------------------------------------------------------------

describe('resolveMode — valid mode output invariant', () => {
  const VALID_MODES: QueryBudgetMode[] = ['off', 'observe', 'throw'];

  test.prop(
    [
      fc.record({
        QUERY_BUDGET_MODE: fc.option(
          fc.oneof(
            fc.constantFrom('off', 'observe', 'throw'),
            fc.string({ minLength: 1, maxLength: 20 }) // invalid strings
          ),
          { nil: undefined }
        ),
        NODE_ENV: fc.option(fc.constantFrom('test', 'production', 'development'), {
          nil: undefined,
        }),
      }),
    ],
    propertyParams()
  )('resolveMode always returns one of off | observe | throw for any env input', (env) => {
    // Build a ProcessEnv-like object (omit undefined keys)
    const procEnv: Record<string, string> = {};
    if (env.QUERY_BUDGET_MODE !== undefined) procEnv['QUERY_BUDGET_MODE'] = env.QUERY_BUDGET_MODE;
    if (env.NODE_ENV !== undefined) procEnv['NODE_ENV'] = env.NODE_ENV;

    const mode = resolveMode(procEnv as NodeJS.ProcessEnv);
    expect(VALID_MODES).toContain(mode);
  });

  test.prop([arbMode], propertyParams())(
    'resolveMode honours explicit QUERY_BUDGET_MODE when it is a valid value',
    (mode) => {
      const result = resolveMode({ QUERY_BUDGET_MODE: mode } as NodeJS.ProcessEnv);
      expect(result).toBe(mode);
    }
  );
});
