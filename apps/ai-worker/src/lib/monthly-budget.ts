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

/** A model the price map bills nothing for (a `:free` OpenRouter model, local Ollama). */
function isFreeModel(pricingKey: string): boolean {
  return calculateCost(pricingKey, 1_000_000, 1_000_000) === 0;
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
  if (isFreeModel(pricingKey)) return;
  const budgetUsd = monthlyBudgetUsd();
  if (!store) {
    if (failsClosed(provider)) {
      throw new MonthlyBudgetExceededError(Number.NaN, budgetUsd);
    }
    return;
  }
  let spentMicros: number;
  try {
    spentMicros = Number.parseInt((await store.get(monthlyBudgetKey(now))) ?? '0', 10) || 0;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.name : 'Error' },
      'Monthly AI spend could not be read'
    );
    if (failsClosed(provider)) throw new MonthlyBudgetExceededError(Number.NaN, budgetUsd);
    return;
  }
  const spentUsd = spentMicros / MICROS_PER_USD;
  if (spentUsd >= budgetUsd) throw new MonthlyBudgetExceededError(spentUsd, budgetUsd);
}

/**
 * Add one billed call to this month's total, priced from its tokens. Never throws: the call
 * it measures has already been paid for, and its answer must not turn into an error.
 */
export async function recordMonthlySpend(
  pricingKey: string,
  inputTokens: number,
  outputTokens: number,
  now: Date = new Date()
): Promise<void> {
  const micros = Math.round(calculateCost(pricingKey, inputTokens, outputTokens) * MICROS_PER_USD);
  if (micros <= 0) return;
  if (!store) {
    logger.warn({ pricingKey, micros }, 'Monthly AI spend not recorded: no store registered');
    return;
  }
  try {
    const key = monthlyBudgetKey(now);
    const totalMicros = await store.incrby(key, micros);
    if (totalMicros === micros) await store.expire(key, KEY_TTL_SECONDS);
    warnOnCrossing(totalMicros - micros, totalMicros);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.name : 'Error', pricingKey, micros },
      'Monthly AI spend could not be recorded'
    );
  }
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
