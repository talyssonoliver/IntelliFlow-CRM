/**
 * ai-actions-allowance.ts — the per-plan AI allowance, counted in AI actions (owner ruling
 * 2026-11-23).
 *
 * The customer-facing allowance is `aiActionsPerMonth` (Starter 1,000, Professional 10,000,
 * Enterprise and Custom unlimited, as on the public pricing page): one action per completed
 * model call, free or paid. Money (`aiSpendCentsPerMonth`) is only an internal cost metric now.
 *
 * - Counting: `createTenantAiActionsRecorder` (utils/tenant-ai-spend.ts) adds 1 per completed
 *   chat call through `QuotaService.increment`, from the cost tracker's usage event.
 * - Enforcing: `assertWithinAiActions` runs before every chat call (tracing/llm-tracer.ts) for
 *   the job's tenant and throws `AiActionsExhaustedError` once the plan's allowance is used up.
 *   The call never reaches a provider and the job fails with that reason; callers must not turn
 *   it into a heuristic answer (agents rethrow it, as they do the purpose ceiling).
 * - The limit comes from QuotaService (plan default plus any TenantQuotaOverride), so an
 *   override works exactly as for every other quota key.
 * - Used and limit are cached 15 s per tenant and UTC month; actions counted by this process in
 *   the window are added locally. The cap is soft by the calls in flight and by other workers'
 *   calls inside the window.
 * - A failed read fails OPEN with a logged reason: the AI is never blocked because the database
 *   is unreachable. The counter is still written when the call completes.
 */

import { getQuotaPeriod, type QuotaKey } from '@intelliflow/domain';

export const AI_ACTIONS_KEY: QuotaKey = 'aiActionsPerMonth';
export const AI_ACTIONS_EXHAUSTED = 'AI_ACTIONS_EXHAUSTED';

export class AiActionsExhaustedError extends Error {
  readonly code = AI_ACTIONS_EXHAUSTED;
  /** Logged as a warning by the shared worker, not as a fault (job-outcome.ts). */
  readonly expected = true;

  constructor(
    readonly used: number,
    readonly limit: number
  ) {
    super(
      `Monthly AI actions limit reached for this plan (${used} of ${limit}). ` +
        'The AI action was not run; the allowance resets at the start of next month (UTC).'
    );
    // BullMQ does not retry a job whose error is named 'UnrecoverableError': the allowance
    // gives the same answer on every retry until next month, so every job type fails once.
    this.name = 'UnrecoverableError';
  }
}

/** True for the allowance error, or an error whose `cause` chain holds it. */
export function isAiActionsExhausted(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === AI_ACTIONS_EXHAUSTED) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** What the check needs from QuotaService. */
export interface AiActionsAllowanceReader {
  getLimits(tenantId: string): Promise<Record<QuotaKey, number | null>>;
  getKeyUsage(tenantId: string, key: QuotaKey): Promise<number>;
}

interface AllowanceEntry {
  period: string;
  limit: number | null;
  used: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 15_000;

let reader: AiActionsAllowanceReader | null = null;

/** Exported so tests can clear it. Key: tenant id. */
export const _allowanceCache = new Map<string, AllowanceEntry>();

/** Writes one action to the tenant's monthly counter (registered at worker boot). */
let actionRecorder: (() => Promise<void>) | null = null;

/** Registered once at worker boot with the recorder that writes aiActionsPerMonth. */
export function setAiActionRecorder(next: (() => Promise<void>) | null): void {
  actionRecorder = next;
}

/**
 * Count one completed chat call. Called by the tracing wrapper for every call, so the count
 * never depends on cost tracking being on. Never throws and never waits for the write.
 */
export function recordAiAction(): void {
  if (!actionRecorder) return;
  actionRecorder().catch((error: unknown) => {
    console.warn(
      `[ai-actions-allowance] USAGE_NOT_RECORDED: AI action not counted: ${String(error)}`
    );
  });
}

/** Registered once at worker boot with the QuotaService-backed reader. */
export function setAiActionsAllowanceReader(next: AiActionsAllowanceReader | null): void {
  reader = next;
  _allowanceCache.clear();
}

const warned = new Set<string>();

function warnOnce(reason: string, detail: string): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(`[ai-actions-allowance] ${reason}: ${detail} — allowance not enforced (fail-open)`);
}

/** Test hook: forget which fail-open reasons were already logged. */
export function __resetAiActionsAllowanceWarnings(): void {
  warned.clear();
}

/** Job contexts that are not a real tenant: nothing to count or limit. */
export function isAllowanceTenant(tenantId: string | undefined): tenantId is string {
  return !!tenantId && tenantId !== 'unknown' && !tenantId.startsWith('__');
}

/** Add actions counted in this process to the cached balance of the same month. */
export function noteAiActions(tenantId: string, by = 1, now: Date = new Date()): void {
  const entry = _allowanceCache.get(tenantId);
  if (entry?.period === getQuotaPeriod(AI_ACTIONS_KEY, now)) entry.used += by;
}

async function load(tenantId: string, now: Date): Promise<AllowanceEntry | null> {
  if (!reader) {
    warnOnce('no reader registered', 'the AI actions allowance was not wired at boot');
    return null;
  }
  const period = getQuotaPeriod(AI_ACTIONS_KEY, now);
  const cached = _allowanceCache.get(tenantId);
  if (cached && cached.period === period && cached.expiresAt > now.getTime()) return cached;
  try {
    const [limits, used] = await Promise.all([
      reader.getLimits(tenantId),
      reader.getKeyUsage(tenantId, AI_ACTIONS_KEY),
    ]);
    const entry: AllowanceEntry = {
      period,
      limit: limits[AI_ACTIONS_KEY],
      // Never lower than what this process already counted for the month.
      used: cached?.period === period ? Math.max(used, cached.used) : used,
      expiresAt: now.getTime() + CACHE_TTL_MS,
    };
    _allowanceCache.set(tenantId, entry);
    return entry;
  } catch (error) {
    warnOnce('allowance read failed', String(error));
    return null;
  }
}

/**
 * Refuse a model call once the tenant has used its plan's AI actions for the month.
 * Non-tenant contexts and unlimited plans (null limit) always pass.
 */
export async function assertWithinAiActions(
  tenantId: string | undefined,
  now: Date = new Date()
): Promise<void> {
  if (!isAllowanceTenant(tenantId)) return;
  const entry = await load(tenantId, now);
  if (!entry || entry.limit === null) return;
  if (entry.used + 1 > entry.limit) throw new AiActionsExhaustedError(entry.used, entry.limit);
}
