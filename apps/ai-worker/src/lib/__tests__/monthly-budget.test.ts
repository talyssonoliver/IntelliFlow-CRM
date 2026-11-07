/**
 * The worker-wide monthly AI budget, against an in-memory stand-in for Redis.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { logWarn, logError } = vi.hoisted(() => ({ logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: logWarn, error: logError, debug: vi.fn() }),
}));

import {
  _resetPendingSpend,
  MonthlyBudgetExceededError,
  assertWithinMonthlyBudget,
  isMonthlyBudgetExceeded,
  monthlyBudgetKey,
  recordMonthlySpend,
  setMonthlyBudgetStore,
  type MonthlyBudgetStore,
} from '../monthly-budget';

const NOV = new Date('2026-11-07T12:00:00Z');
const HAIKU = 'claude-haiku-5-5';
const FREE = 'nvidia/nemotron-3-ultra-550b-a55b:free';

/** A Redis double: one integer per key, shared like Redis is between workers. */
function memoryStore(): MonthlyBudgetStore & {
  values: Map<string, number>;
  ttl: Map<string, number>;
} {
  const values = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    values,
    ttl,
    get: async (key) => (values.has(key) ? String(values.get(key)) : null),
    incrby: async (key, by) => {
      const next = (values.get(key) ?? 0) + by;
      values.set(key, next);
      return next;
    },
    expire: async (key, seconds) => {
      ttl.set(key, seconds);
      return 1;
    },
  };
}

let store: ReturnType<typeof memoryStore>;

beforeEach(() => {
  _resetPendingSpend();
  store = memoryStore();
  setMonthlyBudgetStore(store);
  vi.stubEnv('AI_MONTHLY_BUDGET_USD', '');
  logWarn.mockClear();
  logError.mockClear();
});

afterEach(() => {
  setMonthlyBudgetStore(null);
  vi.unstubAllEnvs();
});

/** Spend `usd` on Haiku 5.5 output tokens ($0.50 per million). */
async function spendUsd(usd: number, now = NOV) {
  await recordMonthlySpend(HAIKU, 0, Math.round((usd / 0.5) * 1_000_000), now);
}

const claudeCall = (now = NOV) => assertWithinMonthlyBudget(HAIKU, 'anthropic', now);

describe('monthly AI budget', () => {
  it('defaults to 60 USD and refuses a paid call once the month reaches it', async () => {
    await spendUsd(59.99);
    await expect(claudeCall()).resolves.toBeUndefined();
    await spendUsd(0.01);
    const refused = claudeCall();
    await expect(refused).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
    await expect(refused).rejects.toSatisfy(isMonthlyBudgetExceeded);
  });

  it('reads AI_MONTHLY_BUDGET_USD', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '5');
    await spendUsd(5);
    await expect(claudeCall()).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
  });

  it('prices each call from its tokens and the model price map', async () => {
    // Haiku: 100K input x $0.10/M + 8K output x $0.50/M = $0.014. Sonnet: 1M + 1M = $12.
    await recordMonthlySpend(HAIKU, 100_000, 8_000, NOV);
    await recordMonthlySpend('claude-sonnet-5-5', 1_000_000, 1_000_000, NOV);
    expect(store.values.get(monthlyBudgetKey(NOV))).toBe(12_014_000);
  });

  it('keeps the total in the shared store, so a restarted or second worker sees it', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '1');
    await spendUsd(1);
    setMonthlyBudgetStore(null);
    setMonthlyBudgetStore(store); // a new process registering the same Redis
    await expect(claudeCall()).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
  });

  it('starts again each UTC month and lets the old key expire', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '1');
    await spendUsd(1, NOV);
    expect(store.ttl.get(monthlyBudgetKey(NOV))).toBeGreaterThan(31 * 24 * 3600);
    await expect(claudeCall(new Date('2026-12-01T00:00:00Z'))).resolves.toBeUndefined();
  });

  it('never refuses a free model, and a free model adds nothing', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '1');
    await spendUsd(2);
    await expect(assertWithinMonthlyBudget(FREE, 'openrouter', NOV)).resolves.toBeUndefined();
    await recordMonthlySpend(FREE, 9_000_000, 9_000_000, NOV);
    expect(store.values.get(monthlyBudgetKey(NOV))).toBe(2_000_000);
  });

  it('warns once at 50% and once at 80%', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10');
    await spendUsd(4);
    expect(logWarn).not.toHaveBeenCalled();
    await spendUsd(1.5); // crosses 50%
    await spendUsd(1); // 65%: no new mark
    await spendUsd(2); // crosses 80%
    await spendUsd(0.5);
    const marks = logWarn.mock.calls.map((call) => (call[0] as { percent: number }).percent);
    expect(marks).toEqual([50, 80]);
  });

  it('fails closed for a Claude call when the total cannot be read or there is no store', async () => {
    setMonthlyBudgetStore({ ...store, get: async () => Promise.reject(new Error('down')) });
    await expect(claudeCall()).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
    setMonthlyBudgetStore(null);
    await expect(claudeCall()).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
  });

  it('decides by the provider being called: a Claude fallback fails closed whatever the primary', async () => {
    setMonthlyBudgetStore(null);
    // The caller passes the fallback model's own provider (llm-tracer, meta.provider).
    await expect(assertWithinMonthlyBudget(HAIKU, 'anthropic', NOV)).rejects.toBeInstanceOf(
      MonthlyBudgetExceededError
    );
    await expect(
      assertWithinMonthlyBudget('scoring-free', 'litellm', NOV)
    ).resolves.toBeUndefined();
  });

  it('keeps a spend it could not write, refuses Claude until it is written, then writes it', async () => {
    const working = store.incrby;
    store.incrby = async () => Promise.reject(new Error('READONLY'));
    await spendUsd(0.004);

    // The shared total is stale while the write fails: a Claude call is refused.
    await expect(claudeCall()).rejects.toBeInstanceOf(MonthlyBudgetExceededError);

    store.incrby = working;
    await expect(claudeCall()).resolves.toBeUndefined();
    expect(store.values.get(monthlyBudgetKey(NOV))).toBe(4000);
  });

  it('loses no spend when concurrent writes fail and later recover', async () => {
    const working = store.incrby;
    store.incrby = async () => Promise.reject(new Error('READONLY'));
    await Promise.all([spendUsd(0.001), spendUsd(0.002)]);
    store.incrby = working;
    await expect(claudeCall()).resolves.toBeUndefined();
    expect(store.values.get(monthlyBudgetKey(NOV))).toBe(3000);
  });

  it('writes concurrent spend once each, never twice', async () => {
    await Promise.all([spendUsd(0.001), spendUsd(0.002), spendUsd(0.003)]);
    await claudeCall();
    expect(store.values.get(monthlyBudgetKey(NOV))).toBe(6000);
  });

  it('counts unwritten spend against the budget for other providers too', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '1');
    await spendUsd(0.9);
    store.incrby = async () => Promise.reject(new Error('READONLY'));
    await spendUsd(0.2); // not written: the shared total still says $0.90
    await expect(assertWithinMonthlyBudget('scoring-free', 'litellm', NOV)).rejects.toBeInstanceOf(
      MonthlyBudgetExceededError
    );
  });

  it('never throws while recording, so a paid answer is not lost', async () => {
    setMonthlyBudgetStore({ ...store, incrby: async () => Promise.reject(new Error('down')) });
    await expect(recordMonthlySpend(HAIKU, 1000, 1000, NOV)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
