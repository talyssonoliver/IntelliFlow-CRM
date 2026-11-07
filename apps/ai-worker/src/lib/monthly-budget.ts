/**
 * monthly-budget.ts — one monthly AI spend cap for the whole worker (owner constraint, 2026-11-07).
 *
 * The Claude key sits in a workspace shared with another product, so no workspace cap protects
 * this service. This module is that cap:
 *
 * - `AI_MONTHLY_BUDGET_USD` (default 60, about GBP 50) caps the spend of every chain together,
 *   per UTC calendar month. The per-tenant purpose ceilings (purpose-ceiling.ts) still apply.
 * - The running total lives in Redis (`ai:spend:usd-micros:<YYYY-MM>`, integer micro-dollars),
 *   so it survives restarts and every worker shares it. It is registered at boot
 *   (`setMonthlyBudgetStore`).
 * - Each billed call adds its cost, computed from its input and output tokens and the per-model
 *   price map (`calculateCost`, MODEL_PRICING). A free model adds nothing.
 * - Before every call, `assertWithinMonthlyBudget` refuses with `MonthlyBudgetExceededError` once
 *   the total reaches the budget. Callers treat that as a failure, never a score.
 * - The log warns once at 50% and once at 80%, when an increment crosses the mark.
 * - The cap is soft by the calls already in flight: cost is known only after a call returns.
 * - Fail closed: on the paid provider, an unregistered store or an unreadable total refuses the
 *   call, because the spend cannot be checked. Free providers are not blocked by an outage.
 */
import { calculateCost, type AIProvider } from '../config/ai.config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('monthly-budget');

export const MONTHLY_BUDGET_EXCEEDED = 'AI_MONTHLY_BUDGET_EXCEEDED';
const DEFAULT_MONTHLY_BUDGET_USD = 60;
const MICROS_PER_USD = 1_000_000;
/** Keys outlive their month by a few days, then expire. */
const KEY_TTL_SECONDS = 40 * 24 * 60 * 60;
const WARN_FRACTIONS = [0.5, 0.8] as const;

export class MonthlyBudgetExceededError extends Error {
  readonly code = MONTHLY_BUDGET_EXCEEDED;
  constructor(
    readonly spentUsd: number,
    readonly budgetUsd: number
  ) {
    super(`Monthly AI budget reached: $${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)}`);
    this.name = 'MonthlyBudgetExceededError';
  }
}

/** True for the budget error, or an error whose `cause` chain holds it. */
export function isMonthlyBudgetExceeded(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === MONTHLY_BUDGET_EXCEEDED) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** The two Redis operations the budget needs (ioredis-compatible). */
export interface MonthlyBudgetStore {
  get(key: string): Promise<string | null>;
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

let store: MonthlyBudgetStore | null = null;

/** Registered once at worker boot with the worker's Redis client. */
export function setMonthlyBudgetStore(next: MonthlyBudgetStore | null): void {
  store = next;
}

/** The budget in USD: AI_MONTHLY_BUDGET_USD, else 60. A non-positive or bad value uses 60. */
export function monthlyBudgetUsd(): number {
  const raw = Number.parseFloat(process.env['AI_MONTHLY_BUDGET_USD'] ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_BUDGET_USD;
}

/** The Redis key holding the spend of the UTC month containing `now`. */
export function monthlyBudgetKey(now: Date = new Date()): string {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `ai:spend:usd-micros:${month}`;
}

/**
 * Only calls to the paid provider fail closed when the total cannot be read. Decided by the
 * provider of the model being called, not the global one: Claude can run as a fallback.
 */
function failsClosed(provider: AIProvider): boolean {
  return provider === 'anthropic';
}

/**
 * A model that cannot bill: an OpenRouter `:free` id (the factory sends only `:free` fallbacks
 * with it) or local Ollama. A LiteLLM alias priced at $0 (`reasoning-free`) is not exempt: the
 * gateway can fall back from it to a paid model.
 */
function isGuaranteedFree(pricingKey: string): boolean {
  const key = pricingKey.trim().toLowerCase();
  return key.endsWith(':free') || key === 'ollama';
}

/**
 * Refuse a paid call once this month's spend has reached the budget. Run before every model
 * call. A free model is never refused: it adds nothing to the spend.
 */
export async function assertWithinMonthlyBudget(
  pricingKey: string,
  provider: AIProvider,
  now: Date = new Date()
): Promise<void> {
  if (isGuaranteedFree(pricingKey)) return;
  const budgetUsd = monthlyBudgetUsd();
  const key = monthlyBudgetKey(now);
  // Spend this process paid for but could not write yet. While it cannot be written, the shared
  // total is stale: a Claude call fails closed rather than spend against it.
  if (!(await flushPending(key)) && failsClosed(provider)) {
    throw new MonthlyBudgetExceededError(Number.NaN, budgetUsd);
  }
  if (!store) {
    if (failsClosed(provider)) throw new MonthlyBudgetExceededError(Number.NaN, budgetUsd);
    return;
  }
  let spentMicros: number;
  try {
    spentMicros = Number.parseInt((await store.get(key)) ?? '0', 10) || 0;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.name : 'Error' },
      'Monthly AI spend could not be read'
    );
    if (failsClosed(provider)) throw new MonthlyBudgetExceededError(Number.NaN, budgetUsd);
    return;
  }
  lastKnownTotal = { key, micros: spentMicros };
  const spentUsd = (spentMicros + (pending.get(key) ?? 0)) / MICROS_PER_USD;
  if (spentUsd >= budgetUsd) throw new MonthlyBudgetExceededError(spentUsd, budgetUsd);
}

/** The shared month total last read or written by this process. */
let lastKnownTotal: { key: string; micros: number } | null = null;

/**
 * This month's spend in USD as last seen by this process (read before the latest paid call,
 * or written after it), with its unwritten spend; null before the first read. Logged on each
 * Claude call so spend can be checked from the logs.
 */
export function monthToDateUsd(now: Date = new Date()): number | null {
  const key = monthlyBudgetKey(now);
  if (lastKnownTotal?.key !== key) return null;
  return (lastKnownTotal.micros + (pending.get(key) ?? 0)) / MICROS_PER_USD;
}

/**
 * Spend that could not be written to the store, per month key, kept until a write succeeds.
 * An ambiguous failure (the increment applied but its reply was lost) can count a call twice:
 * the cap then errs towards stopping early, never towards overspending.
 */
const pending = new Map<string, number>();

/** For tests: forget unwritten spend. */
export function _resetPendingSpend(): void {
  pending.clear();
  writeQueues.clear();
  lastKnownTotal = null;
}

/** Writes per month key run one at a time, so two calls never write the same pending amount. */
const writeQueues = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, write: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(write, write);
  writeQueues.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}

/** Write this process's unwritten spend for `key`. True when nothing is left unwritten. */
async function flushPending(key: string): Promise<boolean> {
  if ((pending.get(key) ?? 0) <= 0) return true;
  return serialized(key, () => writePending(key));
}

/**
 * INCRBY the amount pending for `key`, with the month TTL and the 50%/80% warnings. Only the
 * amount written is removed: spend added by other calls during the write stays pending.
 */
async function writePending(key: string): Promise<boolean> {
  const micros = pending.get(key) ?? 0;
  if (micros <= 0) return true;
  if (!store) return false;
  try {
    const totalMicros = await store.incrby(key, micros);
    const left = (pending.get(key) ?? 0) - micros;
    if (left > 0) pending.set(key, left);
    else pending.delete(key);
    lastKnownTotal = { key, micros: totalMicros };
    if (totalMicros === micros) await store.expire(key, KEY_TTL_SECONDS);
    logger.info(
      {
        addedUsd: micros / MICROS_PER_USD,
        monthToDateUsd: totalMicros / MICROS_PER_USD,
        budgetUsd: monthlyBudgetUsd(),
      },
      'Monthly AI spend recorded'
    );
    warnOnCrossing(totalMicros - micros, totalMicros);
    return left <= 0;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.name : 'Error', unwrittenMicros: micros },
      'Monthly AI spend could not be recorded; kept to retry'
    );
    return false;
  }
}

/**
 * Add one billed call to this month's total, priced from its tokens. Never throws: the call
 * it measures has already been paid for, and its answer must not turn into an error. An
 * amount that cannot be written is kept and retried with the next call.
 */
export async function recordMonthlySpend(
  pricingKey: string,
  inputTokens: number,
  outputTokens: number,
  now: Date = new Date()
): Promise<void> {
  const micros = Math.round(calculateCost(pricingKey, inputTokens, outputTokens) * MICROS_PER_USD);
  if (micros <= 0) return;
  const key = monthlyBudgetKey(now);
  // Counted at once, before any await, so a concurrent check already sees it.
  pending.set(key, (pending.get(key) ?? 0) + micros);
  await serialized(key, () => writePending(key));
}

/** One warning per mark: only the increment that crosses it logs, across all workers. */
function warnOnCrossing(beforeMicros: number, afterMicros: number): void {
  const budgetMicros = monthlyBudgetUsd() * MICROS_PER_USD;
  for (const fraction of WARN_FRACTIONS) {
    const mark = fraction * budgetMicros;
    if (beforeMicros < mark && afterMicros >= mark) {
      logger.warn(
        {
          spentUsd: afterMicros / MICROS_PER_USD,
          budgetUsd: budgetMicros / MICROS_PER_USD,
          percent: fraction * 100,
        },
        `Monthly AI spend passed ${fraction * 100}% of the budget`
      );
    }
  }
}
