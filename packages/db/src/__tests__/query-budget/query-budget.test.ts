/**
 * Unit tests for the ADR-053 query-budget detector core.
 *
 * Imports modules directly (not via the package index) so the Prisma singleton
 * in client.ts is never instantiated — these are pure, DB-free unit tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  runWithQueryBudget,
  getQueryBudgetStore,
  recordQuery,
  getQueryBudgetSnapshot,
  measureQueries,
} from '../../query-budget/context';
import {
  resolveMode,
  budgetForRoute,
  DEFAULT_QUERY_BUDGET,
  resolveBackgroundBudget,
  DEFAULT_BACKGROUND_QUERY_BUDGET,
} from '../../query-budget/config';
import {
  reportOverBudget,
  QueryBudgetExceededError,
  setQueryBudgetEmitter,
  resetQueryBudgetEmitter,
  type QueryBudgetEvent,
} from '../../query-budget/reporter';
import { instrumentOperation, queryBudgetExtension } from '../../query-budget/extension';

const okQuery = async () => 'ok';

afterEach(() => {
  resetQueryBudgetEmitter();
});

describe('query-budget/context', () => {
  it('increments the counter as queries are recorded', async () => {
    const count = await runWithQueryBudget(
      { budget: Number.POSITIVE_INFINITY, context: 'request', route: 'r' },
      async () => {
        recordQuery({ model: 'lead', action: 'findMany', durationMs: 1 });
        recordQuery({ model: 'lead', action: 'count', durationMs: 1 });
        return getQueryBudgetSnapshot()!.count;
      }
    );
    expect(count).toBe(2);
  });

  it('is a complete no-op outside a seeded context (does not crash)', () => {
    expect(getQueryBudgetStore()).toBeUndefined();
    expect(recordQuery({ model: 'lead', action: 'findMany', durationMs: 0 })).toBeUndefined();
    expect(getQueryBudgetSnapshot()).toBeUndefined();
  });

  it('isolates counts between concurrent (interleaved) contexts', async () => {
    async function worker(label: string, ops: number): Promise<number> {
      return runWithQueryBudget(
        { budget: Number.POSITIVE_INFINITY, context: 'request', route: label },
        async () => {
          for (let i = 0; i < ops; i += 1) {
            recordQuery({ model: 'lead', action: 'findMany', durationMs: 0 });
            // Yield so the two contexts interleave on the event loop.
            await Promise.resolve();
          }
          return getQueryBudgetSnapshot()!.count;
        }
      );
    }
    const [a, b] = await Promise.all([worker('a', 3), worker('b', 7)]);
    expect(a).toBe(3);
    expect(b).toBe(7);
  });

  it('measureQueries returns the operation count and snapshot', async () => {
    const { result, count, snapshot } = await measureQueries(async () => {
      await instrumentOperation({
        model: 'lead',
        operation: 'findMany',
        args: { where: {} },
        query: okQuery,
      });
      await instrumentOperation({
        model: 'lead',
        operation: 'count',
        args: { where: {} },
        query: okQuery,
      });
      return 'value';
    });
    expect(result).toBe('value');
    expect(count).toBe(2);
    expect(snapshot.exceeded).toBe(false);
  });
});

describe('query-budget/config', () => {
  it('defaults to observe everywhere; throw is strictly opt-in', () => {
    expect(resolveMode({} as NodeJS.ProcessEnv)).toBe('observe');
    expect(resolveMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('observe');
    // test env does NOT auto-throw — would break unrelated integration tests.
    expect(resolveMode({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe('observe');
    expect(resolveMode({ QUERY_BUDGET_MODE: 'off' } as NodeJS.ProcessEnv)).toBe('off');
    expect(resolveMode({ QUERY_BUDGET_MODE: 'throw' } as NodeJS.ProcessEnv)).toBe('throw');
    expect(
      resolveMode({ NODE_ENV: 'test', QUERY_BUDGET_MODE: 'observe' } as NodeJS.ProcessEnv)
    ).toBe('observe');
  });

  it('budgetForRoute falls back to the default budget', () => {
    expect(budgetForRoute(undefined)).toBe(DEFAULT_QUERY_BUDGET);
    expect(budgetForRoute('trpc.query.unknown')).toBe(DEFAULT_QUERY_BUDGET);
    expect(budgetForRoute('trpc.query.unknown', 99)).toBe(99);
  });

  it('resolveBackgroundBudget uses a generous default and honours the env override', () => {
    expect(resolveBackgroundBudget({} as NodeJS.ProcessEnv)).toBe(DEFAULT_BACKGROUND_QUERY_BUDGET);
    expect(resolveBackgroundBudget({ QUERY_BUDGET_BACKGROUND: '500' } as NodeJS.ProcessEnv)).toBe(
      500
    );
    // invalid / non-positive overrides fall back to the default
    expect(resolveBackgroundBudget({ QUERY_BUDGET_BACKGROUND: 'nope' } as NodeJS.ProcessEnv)).toBe(
      DEFAULT_BACKGROUND_QUERY_BUDGET
    );
    expect(resolveBackgroundBudget({ QUERY_BUDGET_BACKGROUND: '0' } as NodeJS.ProcessEnv)).toBe(
      DEFAULT_BACKGROUND_QUERY_BUDGET
    );
  });
});

describe('query-budget/reporter', () => {
  it('emits a structured event and throws in throw mode for request contexts', () => {
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    const store = {
      requestId: 'req-1',
      route: 'trpc.query.experiment.list',
      method: 'query',
      context: 'request' as const,
      budget: 2,
      count: 5,
      records: [],
      fingerprints: new Map([['Experiment.count()', 4]]),
      reported: false,
    };
    expect(() =>
      reportOverBudget(
        store,
        { model: 'experiment', action: 'count', durationMs: 1 },
        { mode: 'throw' }
      )
    ).toThrow(QueryBudgetExceededError);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'query-budget.exceeded',
      route: 'trpc.query.experiment.list',
      queryCount: 5,
      queryBudget: 2,
      repeatedQueryFingerprint: 'Experiment.count()',
      repeatedQueryCount: 4,
    });
  });

  it('never throws for background contexts even in throw mode', () => {
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    const store = {
      context: 'background' as const,
      budget: 1,
      count: 9,
      records: [],
      fingerprints: new Map<string, number>(),
      reported: false,
    };
    expect(() =>
      reportOverBudget(
        store,
        { model: 'ticket', action: 'findMany', durationMs: 1 },
        { mode: 'throw' }
      )
    ).not.toThrow();
    expect(events).toHaveLength(1);
  });

  it('off mode neither emits nor throws', () => {
    const emit = vi.fn();
    setQueryBudgetEmitter(emit);
    const store = {
      context: 'request' as const,
      budget: 1,
      count: 9,
      records: [],
      fingerprints: new Map<string, number>(),
      reported: false,
    };
    reportOverBudget(store, { model: 'lead', action: 'findMany', durationMs: 1 }, { mode: 'off' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('the default emitter writes a single structured warning line', () => {
    // No custom emitter set (afterEach reset it) → the default console.warn
    // emitter is active. This is the production-default path.
    resetQueryBudgetEmitter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = {
      requestId: 'req-default',
      route: 'trpc.query.lead.list',
      method: 'query',
      context: 'request' as const,
      budget: 1,
      count: 4,
      records: [],
      fingerprints: new Map<string, number>(),
      reported: false,
    };
    reportOverBudget(
      store,
      { model: 'lead', action: 'findMany', durationMs: 1 },
      { mode: 'observe' }
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warn.mock.calls[0]?.[0] as string);
    expect(logged).toMatchObject({ type: 'query-budget.exceeded', queryCount: 4, exceeded: true });
    warn.mockRestore();
  });

  it('setQueryBudgetEmitter returns a restore fn that reinstates the previous emitter', () => {
    const first = vi.fn();
    const second = vi.fn();
    setQueryBudgetEmitter(first);
    const restore = setQueryBudgetEmitter(second);
    // Restoring should bring back `first`, not leave `second` installed.
    restore();
    const store = {
      context: 'request' as const,
      budget: 1,
      count: 3,
      records: [],
      fingerprints: new Map<string, number>(),
      reported: false,
    };
    reportOverBudget(store, { model: 'lead', action: 'count', durationMs: 1 }, { mode: 'observe' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('query-budget/extension (instrumentOperation)', () => {
  it('passes through unchanged when no budget context is active', async () => {
    const query = vi.fn(async () => 42);
    const result = await instrumentOperation({
      model: 'lead',
      operation: 'findMany',
      args: { a: 1 },
      query,
    });
    expect(result).toBe(42);
    expect(query).toHaveBeenCalledWith({ a: 1 });
  });

  it('queryBudgetExtension() exposes a plain $allOperations hook that delegates to instrumentOperation', async () => {
    const ext = queryBudgetExtension();
    expect(ext.name).toBe('query-budget');
    expect(typeof ext.query.$allOperations).toBe('function');
    // Drive the hook with no active budget context → it passes the args through
    // to the underlying query thunk (same contract as instrumentOperation).
    const query = vi.fn(async () => 'via-extension');
    const result = await ext.query.$allOperations({
      model: 'lead',
      operation: 'findMany',
      args: { a: 1 },
      query,
    });
    expect(result).toBe('via-extension');
    expect(query).toHaveBeenCalledWith({ a: 1 });
  });

  it('counts each operation against the active budget (under budget = ignored)', async () => {
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    const snap = await measureQueries(
      async () => {
        await instrumentOperation({
          model: 'lead',
          operation: 'findMany',
          args: {},
          query: okQuery,
        });
        await instrumentOperation({ model: 'lead', operation: 'count', args: {}, query: okQuery });
      },
      { budget: 15 }
    );
    expect(snap.count).toBe(2);
    expect(events).toHaveLength(0); // under budget — nothing reported
  });

  it('reports once (observe — the default) when over budget, WITHOUT throwing', async () => {
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    const out = await runWithQueryBudget(
      { budget: 2, context: 'request', route: 't' },
      async () => {
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '1' } },
          query: okQuery,
        });
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '2' } },
          query: okQuery,
        });
        // 3rd op tips count (3) over budget (2) -> reported, not thrown (observe).
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '3' } },
          query: okQuery,
        });
        return 'ok';
      }
    );
    expect(out).toBe('ok');
    expect(events).toHaveLength(1); // reported exactly once
    expect(events[0]?.queryCount).toBe(3);
  });

  it('throws over budget ONLY when QUERY_BUDGET_MODE=throw (opt-in guard)', async () => {
    vi.stubEnv('QUERY_BUDGET_MODE', 'throw');
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    await expect(
      runWithQueryBudget({ budget: 2, context: 'request', route: 't' }, async () => {
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '1' } },
          query: okQuery,
        });
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '2' } },
          query: okQuery,
        });
        await instrumentOperation({
          model: 'contact',
          operation: 'findUnique',
          args: { where: { id: '3' } },
          query: okQuery,
        });
      })
    ).rejects.toBeInstanceOf(QueryBudgetExceededError);
    expect(events).toHaveLength(1);
    expect(events[0]?.queryCount).toBe(3);
  });

  it('never throws for a background job even in throw mode (records only)', async () => {
    vi.stubEnv('QUERY_BUDGET_MODE', 'throw');
    const events: QueryBudgetEvent[] = [];
    setQueryBudgetEmitter((e) => events.push(e));
    const out = await runWithQueryBudget(
      { budget: 1, context: 'background', route: 'sla-monitor' },
      async () => {
        await instrumentOperation({
          model: 'ticket',
          operation: 'findMany',
          args: {},
          query: okQuery,
        });
        await instrumentOperation({
          model: 'ticket',
          operation: 'findMany',
          args: {},
          query: okQuery,
        });
        return 'job-complete';
      }
    );
    expect(out).toBe('job-complete');
    expect(events).toHaveLength(1); // reported, but not thrown
  });

  it('counts a failed operation and re-throws the ORIGINAL error (no masking)', async () => {
    const dbError = new Error('connection reset');
    const failing = async () => {
      throw dbError;
    };
    let recorded: number | undefined;
    await expect(
      runWithQueryBudget({ budget: 15, context: 'request', route: 't' }, async () => {
        try {
          await instrumentOperation({
            model: 'lead',
            operation: 'findMany',
            args: {},
            query: failing,
          });
        } finally {
          recorded = getQueryBudgetSnapshot()!.count;
        }
      })
    ).rejects.toBe(dbError); // original error, NOT a budget error
    expect(recorded).toBe(1); // the failed attempt was still counted
  });

  it('detects the N+1 signature via repeated structural fingerprints', async () => {
    const { snapshot } = await measureQueries(async () => {
      // Same model+operation+where-shape, three times = N+1 signature.
      for (const id of ['1', '2', '3']) {
        await instrumentOperation({
          model: 'lead',
          operation: 'findUnique',
          args: { where: { id } },
          query: okQuery,
        });
      }
    });
    expect(snapshot.count).toBe(3);
    expect(snapshot.repeated).toEqual([{ fingerprint: 'lead.findUnique(where|id)', count: 3 }]);
  });
});
