/**
 * Quota guards for cost-bearing procedures.
 *
 * Error contract: a tenant over quota gets tRPC `PRECONDITION_FAILED` whose `cause` is the
 * domain `QuotaExceededError` (`{ code: 'QUOTA_EXCEEDED', key, used, limit }`). The error
 * formatter (trpc.ts) also exposes that payload to clients as `error.data.quota`.
 *
 * Failure policy:
 * - Quota lookup fails: fail CLOSED (INTERNAL_SERVER_ERROR) — this is cost control.
 * - Quota service not wired into the context: fail CLOSED too. Only a test process
 *   (NODE_ENV=test) that sets QUOTA_GUARD_ALLOW_MISSING_SERVICE=1 may skip the guard.
 * - Metered keys (emailsPerMonth): `reserveQuota` checks and increments in ONE atomic statement
 *   before the action and the caller releases on failure, so concurrent requests cannot
 *   overshoot the limit.
 * - Live-count keys (contacts, seats, workflowsActive): `withQuotaLock` counts and creates under
 *   a per-(tenant, key) lock.
 * - Recording usage after the action succeeded never fails the call, but a failure is retried
 *   once and then logged at WARN with the tenant and key so the gap can be reconciled.
 */

import { TRPCError } from '@trpc/server';
import type { QuotaService } from '@intelliflow/application';
import { QUOTA_EXCEEDED_CODE, type QuotaKey } from '@intelliflow/domain';

type GuardQuotaService = Pick<
  QuotaService,
  'assertWithinQuota' | 'increment' | 'reserve' | 'release' | 'withinQuota'
>;

interface QuotaContext {
  services?: { quota?: Partial<GuardQuotaService> };
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

/** Test-only escape hatch: both conditions are required, so production can never skip. */
function missingServiceAllowed(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.QUOTA_GUARD_ALLOW_MISSING_SERVICE === '1';
}

/** The wired quota service, `undefined` when a test explicitly allows skipping, else throws. */
function requireQuota(ctx: QuotaContext, tenantId: string, key: QuotaKey) {
  const quota = ctx.services?.quota;
  if (quota) return quota;
  if (missingServiceAllowed()) return undefined;
  console.error('[quota] quota service is not wired; refusing to skip enforcement', {
    tenantId,
    key,
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Quota enforcement is unavailable, so the ${key} limit cannot be verified.`,
  });
}

function toTRPCError(error: unknown, tenantId: string, key: QuotaKey): TRPCError {
  if (error instanceof TRPCError) return error;
  if (isQuotaExceeded(error)) {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Your plan's ${key} limit has been reached (${error.used} of ${error.limit}).`,
      cause: error,
    });
  }
  console.error('[quota] could not verify quota', { tenantId, key, error });
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Could not verify the ${key} quota.`,
  });
}

/** Reject with PRECONDITION_FAILED when `used + increment` would pass the tenant's limit. */
export async function assertQuota(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  increment = 1
): Promise<void> {
  const quota = requireQuota(ctx, tenantId, key);
  if (!quota) return;

  try {
    await quota.assertWithinQuota!(tenantId, key, increment);
  } catch (error) {
    throw toTRPCError(error, tenantId, key);
  }
}

/**
 * Atomically reserve `by` units of a metered key BEFORE the action. Returns a `release`
 * function the caller must invoke if the action then fails (it never throws).
 */
export async function reserveQuota(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  by = 1
): Promise<() => Promise<void>> {
  const quota = requireQuota(ctx, tenantId, key);
  if (!quota) return async () => undefined;

  try {
    await quota.reserve!(tenantId, key, by);
  } catch (error) {
    throw toTRPCError(error, tenantId, key);
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await quota.release!(tenantId, key, by);
    } catch (error) {
      console.warn('[quota] failed to release a reservation; usage is over-counted', {
        tenantId,
        key,
        by,
        error,
      });
    }
  };
}

/**
 * Live-count keys: assert the quota and run `create` under a per-(tenant, key) lock. `create`
 * must have committed its row before it resolves. Errors from `create` propagate unchanged.
 */
export async function withQuotaLock<T>(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  increment: number,
  create: () => Promise<T>
): Promise<T> {
  const quota = requireQuota(ctx, tenantId, key);
  if (!quota) return create();

  type Outcome = { ok: true; value: T } | { ok: false; error: unknown };
  let outcome: Outcome;
  try {
    outcome = await quota.withinQuota!(tenantId, key, increment, async (): Promise<Outcome> => {
      try {
        return { ok: true, value: await create() };
      } catch (error) {
        return { ok: false, error };
      }
    });
  } catch (error) {
    throw toTRPCError(error, tenantId, key);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/**
 * Record consumption of a metered key after the action succeeded. Never throws, but a failure
 * is retried once and then logged loudly: the action happened, so the counter is now short.
 */
export async function recordUsage(
  ctx: QuotaContext,
  tenantId: string,
  key: QuotaKey,
  by = 1
): Promise<void> {
  const quota = ctx.services?.quota;
  if (!quota) {
    if (!missingServiceAllowed()) {
      console.warn('[quota] USAGE_NOT_RECORDED: quota service is not wired', { tenantId, key, by });
    }
    return;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await quota.increment!(tenantId, key, by);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('[quota] USAGE_NOT_RECORDED: increment failed after retry', {
    tenantId,
    key,
    by,
    error: lastError,
  });
}
