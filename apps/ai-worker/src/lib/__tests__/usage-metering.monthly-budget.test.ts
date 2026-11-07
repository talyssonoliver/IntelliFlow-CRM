/**
 * Embeddings and the worker-wide monthly AI budget: paid embedding calls are checked and
 * counted like chat calls. In-memory store only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { guardEmbeddingCall, recordEmbeddingUsage } from '../usage-metering';
import {
  MonthlyBudgetExceededError,
  _resetPendingSpend,
  monthlyBudgetKey,
  setMonthlyBudgetStore,
} from '../monthly-budget';

const PAID = 'gemini-embedding-001';
const values = new Map<string, number>();

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
});

afterEach(() => setMonthlyBudgetStore(null));

describe('embeddings and the monthly AI budget', () => {
  it('refuses a paid embedding call once the budget is used, for any tenant', async () => {
    values.set(monthlyBudgetKey(), 60_000_000);
    await expect(guardEmbeddingCall(undefined, 'free', PAID)).rejects.toBeInstanceOf(
      MonthlyBudgetExceededError
    );
  });

  it('never refuses a free embedding model', async () => {
    values.set(monthlyBudgetKey(), 60_000_000);
    await expect(
      guardEmbeddingCall(undefined, 'free', 'nvidia/nemotron-3-embed-1b:free')
    ).resolves.toBeUndefined();
  });

  it('adds a paid embedding call to the month, even without a billable tenant', async () => {
    recordEmbeddingUsage(undefined, { tier: 'free', pricingKey: PAID }, ['word '.repeat(20_000)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(values.get(monthlyBudgetKey()) ?? 0).toBeGreaterThan(0);
  });
});
