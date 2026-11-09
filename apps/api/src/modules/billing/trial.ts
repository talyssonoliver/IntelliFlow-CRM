/**
 * The workspace trial (#1220): one length, one rule for where its end comes from.
 *
 * A self-service sign-up gets a trial that ends TRIAL_DAYS after it starts, stored on
 * `Tenant.trialEndsAt`. Rows from before that column existed hold NULL until the backfill
 * runs, and fall back to the old rule (created + TRIAL_DAYS) meanwhile.
 */

export const TRIAL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a trial that starts at `start` ends. */
export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

/** The stored trial end, or the created + TRIAL_DAYS fallback for rows not yet backfilled. */
export function effectiveTrialEnd(tenant: { trialEndsAt: Date | null; createdAt: Date }): Date {
  return tenant.trialEndsAt ?? trialEndFrom(tenant.createdAt);
}

/** Whole days left, rounded up, never negative. */
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}
