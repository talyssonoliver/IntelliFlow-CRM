/**
 * Tenant AI-spend recorder
 *
 * The API enforces `aiSpendCentsPerMonth` per tenant, but the only place AI cost is known is
 * here in the worker, at the moment a model call completes (`costTracker.recordUsage`). This
 * listener attributes that cost to the tenant of the job being processed (from the
 * AsyncLocalStorage tenant context) and records it through `QuotaService.increment`.
 *
 * Accuracy, stated plainly: the cost is an ESTIMATE (token counts x the model pricing table),
 * not a provider invoice. Sub-cent costs accumulate in a per-tenant carry so they are not
 * rounded away; only whole cents are written. A failed write is logged at WARN with the
 * tenant and key and the cents are kept in the carry for the next call, so a transient DB
 * error delays the counter rather than losing the spend.
 */

import type { PurposeSpendPort, QuotaService } from '@intelliflow/application';
import { LLM_PURPOSES, purposeSpendPeriod, type LLMPurpose } from '@intelliflow/domain';
import { notePurposeSpend } from '../lib/purpose-ceiling.js';
import type { UsageMetrics } from './cost-tracker';

export const AI_SPEND_KEY = 'aiSpendCentsPerMonth' as const;

interface SpendLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface TenantAiSpendRecorderOptions {
  quota: Pick<QuotaService, 'increment'>;
  /** Tenant of the job currently being processed, if any. */
  getTenantId: () => string | undefined;
  logger: SpendLogger;
  /** Upper bound on cents held back after repeated failures (protects against unbounded growth). */
  maxCarryCents?: number;
}

/** Job contexts that are not a real tenant: spend there has no owner to bill. */
function isBillableTenant(tenantId: string | undefined): tenantId is string {
  return !!tenantId && tenantId !== 'unknown' && !tenantId.startsWith('__');
}

export function createTenantAiSpendRecorder(options: TenantAiSpendRecorderOptions) {
  const { quota, getTenantId, logger, maxCarryCents = 100_000 } = options;
  /** Unwritten spend per tenant, in cents (fractional). */
  const carry = new Map<string, number>();

  /** Returns a promise that settles when the write attempt finishes (never rejects). */
  return function recordTenantSpend(usage: Pick<UsageMetrics, 'cost'>): Promise<void> {
    const tenantId = getTenantId();
    if (!isBillableTenant(tenantId) || !(usage.cost > 0)) return Promise.resolve();

    // Never clamp here: the newly reported cost is written in full. maxCarryCents only bounds
    // the cents held back after failed writes (below).
    const pending = (carry.get(tenantId) ?? 0) + usage.cost * 100;
    const whole = Math.floor(pending);
    carry.set(tenantId, pending - whole);
    if (whole < 1) return Promise.resolve();

    return quota.increment(tenantId, AI_SPEND_KEY, whole).catch((error: unknown) => {
      // Keep the cents so the next successful call writes them.
      carry.set(tenantId, Math.min((carry.get(tenantId) ?? 0) + whole, maxCarryCents));
      logger.warn(
        { tenantId, key: AI_SPEND_KEY, cents: whole, error: String(error) },
        'USAGE_NOT_RECORDED: failed to record AI spend; will retry with the next call'
      );
    });
  };
}

// ---------------------------------------------------------------------------
// PG-199 (ADR-082): per-purpose monthly spend for the purpose cost ceilings
// ---------------------------------------------------------------------------

const KNOWN_PURPOSES: ReadonlySet<string> = new Set<LLMPurpose>(LLM_PURPOSES);

export interface PurposeSpendRecorderOptions {
  spend: Pick<PurposeSpendPort, 'addSpend'>;
  /** Tenant of the job currently being processed, if any. */
  getTenantId: () => string | undefined;
  logger: SpendLogger;
  /** Clock, injectable for tests. */
  now?: () => Date;
  /** Upper bound on centicents held back after repeated failures. */
  maxCarryCentiCents?: number;
}

/**
 * Records each call's estimated cost against its AI purpose (from the usage metadata set by
 * lib/usage-metering.ts) in hundredths of a cent for the UTC month, so embeddings' sub-cent
 * costs still add up. The carry is keyed by (tenant, purpose, month): a new month never
 * inherits last month's remainder. Spend written here is also added to the local ceiling
 * cache (`notePurposeSpend`) so a burst inside the cache window counts immediately.
 */
export function createPurposeSpendRecorder(options: PurposeSpendRecorderOptions) {
  const {
    spend,
    getTenantId,
    logger,
    now = () => new Date(),
    maxCarryCentiCents = 10_000_000,
  } = options;
  // Sub-centicent remainder of new usage, and whole centicents whose write failed. Kept
  // apart so a retried amount is written again but never counted twice in the local
  // ceiling cache.
  const fraction = new Map<string, number>();
  const unwritten = new Map<string, number>();

  return function recordPurposeSpend(
    usage: Pick<UsageMetrics, 'cost' | 'metadata'>
  ): Promise<void> {
    const tenantId = getTenantId();
    const purpose = usage.metadata?.['purpose'];
    if (!isBillableTenant(tenantId) || !(usage.cost > 0)) return Promise.resolve();
    if (typeof purpose !== 'string' || !KNOWN_PURPOSES.has(purpose)) return Promise.resolve();

    const at = now();
    const period = purposeSpendPeriod(at);
    const key = `${tenantId}:${purpose}:${period}`;
    const pending = (fraction.get(key) ?? 0) + usage.cost * 10_000;
    const fresh = Math.floor(pending);
    fraction.set(key, pending - fresh);
    const whole = fresh + (unwritten.get(key) ?? 0);
    unwritten.delete(key);
    if (whole < 1) return Promise.resolve();

    if (fresh > 0) notePurposeSpend(tenantId, purpose as LLMPurpose, fresh, at);
    return spend
      .addSpend(tenantId, purpose as LLMPurpose, period, whole)
      .then(() => undefined)
      .catch((error: unknown) => {
        unwritten.set(key, Math.min((unwritten.get(key) ?? 0) + whole, maxCarryCentiCents));
        logger.warn(
          { tenantId, purpose, period, centiCents: whole, error: String(error) },
          'USAGE_NOT_RECORDED: failed to record per-purpose AI spend; will retry with the next call'
        );
      });
  };
}
