/**
 * PG-199 BYOK metering: a call on the tenant's own key is counted as the TENANT's usage but never
 * toward, or refused by, the platform's worker-wide monthly budget (AI_MONTHLY_BUDGET_USD) or its
 * daily cost limit. The same call on a platform model still is. Real tracer, real budget module
 * with an in-memory store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { wrapModelWithTracing } from '../../tracing/llm-tracer';
import { tenantContextStore } from '../../tracing/tenant-context';
import { costTracker } from '../../utils/cost-tracker';
import {
  MonthlyBudgetExceededError,
  _resetPendingSpend,
  monthlyBudgetKey,
  setMonthlyBudgetStore,
} from '../monthly-budget';

const values = new Map<string, number>();

/** A model double whose answer reports a big token usage (1M in + 1M out). */
function bigSpender() {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: 'ok',
      usage_metadata: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    }),
    withConfig: undefined,
  } as never;
}

const META = { purpose: 'scoring', tier: 'free', pricingKey: 'gpt-4o' } as const;

function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContextStore.run({ tenantId: 'tenant-a' }, fn);
}

let usages: { cost: number; metadata?: Record<string, unknown> }[];
let stopListening: () => void;

beforeEach(() => {
  _resetPendingSpend();
  values.clear();
  setMonthlyBudgetStore({
    get: async (key) => (values.has(key) ? String(values.get(key)) : null),
    incrby: async (key, by) => {
      values.set(key, (values.get(key) ?? 0) + by);
      return values.get(key)!;
    },
    expire: async () => 1,
  });
  usages = [];
  stopListening = costTracker.addListener((usage) => usages.push(usage));
});

afterEach(() => {
  stopListening();
  setMonthlyBudgetStore(null);
});

describe('BYOK calls and the platform budget', () => {
  it('a BYOK call does not increment the monthly budget', async () => {
    const model = wrapModelWithTracing(bigSpender(), { ...META, byok: true });
    await runAsTenant(() => model.invoke('hi'));
    expect(values.get(monthlyBudgetKey()) ?? 0).toBe(0);
  });

  it('the same call on a platform model does increment it (the control)', async () => {
    const model = wrapModelWithTracing(bigSpender(), { ...META });
    await runAsTenant(() => model.invoke('hi'));
    expect(values.get(monthlyBudgetKey()) ?? 0).toBeGreaterThan(0);
  });

  it('a BYOK call is not refused when the platform budget is used up; a platform call is', async () => {
    values.set(monthlyBudgetKey(), 60_000_000);
    const own = wrapModelWithTracing(bigSpender(), { ...META, byok: true });
    await expect(runAsTenant(() => own.invoke('hi'))).resolves.toBeTruthy();

    const platform = wrapModelWithTracing(bigSpender(), { ...META });
    await expect(runAsTenant(() => platform.invoke('hi'))).rejects.toBeInstanceOf(
      MonthlyBudgetExceededError
    );
    // The BYOK call added nothing to the used-up total.
    expect(values.get(monthlyBudgetKey())).toBe(60_000_000);
  });

  it('a BYOK call is still recorded as the tenant usage (with its cost and a byok mark)', async () => {
    const model = wrapModelWithTracing(bigSpender(), { ...META, byok: true });
    await runAsTenant(() => model.invoke('hi'));
    expect(usages).toHaveLength(1);
    expect(usages[0]!.cost).toBeGreaterThan(0);
    expect(usages[0]!.metadata).toMatchObject({ purpose: 'scoring', byok: true });
  });

  it('a platform call carries no byok mark', async () => {
    const model = wrapModelWithTracing(bigSpender(), { ...META });
    await runAsTenant(() => model.invoke('hi'));
    expect(usages[0]!.metadata?.['byok']).toBeUndefined();
  });

  it('BYOK usage does not count toward the platform daily cost total', () => {
    const before = costTracker.getDailyCost();
    costTracker.recordUsage({
      model: 'gpt-4o',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      operationType: 'llm:scoring',
      metadata: { byok: true },
    });
    expect(costTracker.getDailyCost()).toBe(before);
    costTracker.recordUsage({
      model: 'gpt-4o',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      operationType: 'llm:scoring',
    });
    expect(costTracker.getDailyCost()).toBeGreaterThan(before);
  });
});
