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

import type { QuotaService } from '@intelliflow/application';
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

    const pending = Math.min((carry.get(tenantId) ?? 0) + usage.cost * 100, maxCarryCents);
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
