/**
 * Stripe subscription status — persistence contract + portal mapping.
 *
 * The CRM persists the raw Stripe status (8 values) for offline-reliable billing
 * state, and maps it to the portal's 5-value `subscriptionStatus` enum for the
 * client dashboard. Only ENGINE subscriptions (those carrying a `tenantSlug`)
 * are pushed to the portal; the CRM's own SaaS-plan subscriptions are persisted
 * but not pushed.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (step 4)
 */

/** Stripe's subscription.status values (see Stripe API). */
export type StripeSubscriptionStatusValue =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/** The Prisma `StripeSubscriptionStatus` enum values (uppercase). */
export type StripeSubscriptionStatusDb =
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'PAUSED';

/** The portal's 5-value `subscriptionStatus`. */
export type PortalSubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'paused';

const TO_DB: Record<StripeSubscriptionStatusValue, StripeSubscriptionStatusDb> = {
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE_EXPIRED',
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'UNPAID',
  paused: 'PAUSED',
};

const TO_PORTAL: Record<StripeSubscriptionStatusValue, PortalSubscriptionStatus> = {
  incomplete: 'none', // not yet active
  incomplete_expired: 'canceled',
  trialing: 'active', // a trial is a live engagement
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  paused: 'paused',
};

/** Map a raw Stripe status to the Prisma enum value. Defaults to INCOMPLETE if unknown. */
export function toDbSubscriptionStatus(status: string): StripeSubscriptionStatusDb {
  return TO_DB[status as StripeSubscriptionStatusValue] ?? 'INCOMPLETE';
}

/** Map a raw Stripe status to the portal's 5-value enum. Unknown → 'none'. */
export function mapStripeToPortalSubscriptionStatus(status: string): PortalSubscriptionStatus {
  return TO_PORTAL[status as StripeSubscriptionStatusValue] ?? 'none';
}

/** Inputs captured from a `customer.subscription.*` webhook for persistence. */
export interface StripeSubscriptionRecordInput {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: StripeSubscriptionStatusDb;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** CRM tenant scope (subscription metadata.tenantId). */
  tenantId: string;
  /** Portal slug — present only for engine subscriptions (metadata.tenantSlug). */
  tenantSlug: string | null;
}

/**
 * Persistence contract for Stripe subscriptions. Implemented in adapters
 * (Prisma in prod, in-memory in tests).
 *
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface StripeSubscriptionRepository {
  /** Upsert subscription state keyed on `stripeSubscriptionId` (idempotent). */
  upsertFromWebhook(input: StripeSubscriptionRecordInput): Promise<void>;
}
