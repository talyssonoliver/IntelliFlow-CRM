/**
 * Quota guards for cost-bearing procedures.
 *
 * Error contract: a tenant over quota gets tRPC `PRECONDITION_FAILED` whose `cause` is the
 * domain `QuotaExceededError` (`{ code: 'QUOTA_EXCEEDED', key, used, limit }`). The error
 * formatter (trpc.ts) also exposes that payload to clients as `error.data.quota`.
 *
 * Failure policy:
 * - Quota lookup fails: fail CLOSED (INTERNAL_SERVER_ERROR) — this is cost control.
 * - Quota service not wired into the context (unit tests, partial contexts): guard is skipped.
 * - Recording usage after the action succeeded is best-effort: it logs but never fails the call.
 */

import { TRPCError } from '@trpc/server';
import type { QuotaService } from '@intelliflow/application';
import { QUOTA_EXCEEDED_CODE, type QuotaKey } from '@intelliflow/domain';

interface QuotaContext {
  services?: { quota?: Pick<QuotaService, 'assertWithinQuota' | 'increment'> };
}

interface QuotaExceededPayload {
  code: typeof QUOTA_EXCEEDED_CODE;
  key: QuotaKey;
  used: number;
  limit: number;
}

export function isQuotaExceeded(error: unknown): error is Error & QuotaExceededPayload {
  return error instanceof Error && (error as { code?: unknown }).code === QUOTA_EXCEEDED_CODE;
}

/** Reject with PRECONDITION_FAILED when `used + increment` would pass the tenant's limit. */
export async function assertQuota(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  increment = 1
): Promise<void> {
  const quota = ctx.services?.quota;
  if (!quota) return;

  try {
    await quota.assertWithinQuota(tenantId, key, increment);
  } catch (error) {
    if (isQuotaExceeded(error)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Your plan's ${key} limit has been reached (${error.used} of ${error.limit}).`,
        cause: error,
      });
    }
    console.error('[quota] could not verify quota', { tenantId, key, error });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Could not verify the ${key} quota.`,
    });
  }
}

/** Record consumption of a metered key after the action succeeded. Never throws. */
export async function recordUsage(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  by = 1
): Promise<void> {
  const quota = ctx.services?.quota;
  if (!quota) return;

  try {
    await quota.increment(tenantId, key, by);
  } catch (error) {
    console.error('[quota] failed to record usage', { tenantId, key, by, error });
  }
}
