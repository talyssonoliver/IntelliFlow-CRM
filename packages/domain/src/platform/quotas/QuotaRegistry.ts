/**
 * Quota Registry — Single Source of Truth
 *
 * Per-plan usage limits used for per-tenant cost control. Pure domain data:
 * enforcement lives in the application layer (QuotaService) and the API guards.
 *
 * `null` means unlimited. A limit of `0` means the capability is disabled for the plan.
 */

import type { PlanTier } from '../modules/ModuleRegistry';

export const QUOTA_KEYS = [
  'contacts',
  'seats',
  'emailsPerMonth',
  'aiSpendCentsPerMonth',
  'aiActionsPerMonth',
  'workflowsActive',
] as const;

export type QuotaKey = (typeof QUOTA_KEYS)[number];

/** Keys whose usage resets every calendar month (UTC); the rest are live totals. */
export const MONTHLY_QUOTA_KEYS: readonly QuotaKey[] = [
  'emailsPerMonth',
  'aiSpendCentsPerMonth',
  'aiActionsPerMonth',
];

export type QuotaLimits = Record<QuotaKey, number | null>;

/**
 * AI allowance (owner ruling 2026-11-23): the customer-facing AI allowance counts AI ACTIONS
 * (one per completed model call, free or paid), `aiActionsPerMonth`, and matches the public
 * pricing page ("1,000 / 10,000 AI predictions/month", Enterprise unlimited). `aiSpendCentsPerMonth`
 * stays recorded as an internal cost metric only and is no longer the customer allowance:
 * nothing enforces it.
 *
 * Default limits per plan tier. Tenants can diverge via TenantQuotaOverride rows.
 */
export const QUOTA_PLAN_MAP: Record<PlanTier, QuotaLimits> = {
  PARTNER_FREE: {
    contacts: 500,
    seats: 2,
    emailsPerMonth: 0,
    aiSpendCentsPerMonth: 0,
    aiActionsPerMonth: 0,
    workflowsActive: 0,
  },
  STARTER: {
    contacts: 2000,
    seats: 3,
    emailsPerMonth: 500,
    aiSpendCentsPerMonth: 2000,
    aiActionsPerMonth: 1000,
    workflowsActive: 3,
  },
  PROFESSIONAL: {
    contacts: 20000,
    seats: 10,
    emailsPerMonth: 5000,
    aiSpendCentsPerMonth: 20000,
    aiActionsPerMonth: 10000,
    workflowsActive: 25,
  },
  ENTERPRISE: {
    contacts: null,
    seats: null,
    emailsPerMonth: null,
    aiSpendCentsPerMonth: null,
    aiActionsPerMonth: null,
    workflowsActive: null,
  },
  CUSTOM: {
    contacts: null,
    seats: null,
    emailsPerMonth: null,
    aiSpendCentsPerMonth: null,
    aiActionsPerMonth: null,
    workflowsActive: null,
  },
};

export function isQuotaKey(value: unknown): value is QuotaKey {
  return typeof value === 'string' && (QUOTA_KEYS as readonly string[]).includes(value);
}

export function isMonthlyQuotaKey(key: QuotaKey): boolean {
  return MONTHLY_QUOTA_KEYS.includes(key);
}

/** Default limits for a plan (a fresh copy, safe to mutate). */
export function getQuotaLimitsForPlan(plan: PlanTier): QuotaLimits {
  return { ...QUOTA_PLAN_MAP[plan] };
}

/** Usage period bucket: 'YYYY-MM' (UTC) for monthly keys, 'all' otherwise. */
export function getQuotaPeriod(key: QuotaKey, now: Date = new Date()): string {
  if (!isMonthlyQuotaKey(key)) return 'all';
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Whether `used + increment` fits inside `limit` (null = unlimited).
 * Usage may exceed the limit already (e.g. after a downgrade); such a tenant is simply full.
 */
export function isWithinQuota(used: number, increment: number, limit: number | null): boolean {
  return limit === null || used + increment <= limit;
}
