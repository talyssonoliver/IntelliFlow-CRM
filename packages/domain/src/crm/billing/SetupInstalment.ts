/**
 * SetupInstalment — the Playbook's one-off "Setup fee", billed in instalments
 * across the 14-day delivery window.
 *
 * Default plan: **3 × £167 (16700 minor units)** due at **day 0 / 7 / 14** from the
 * contract signature. The structure is per-tier configurable (see {@link SETUP_PLANS})
 * so premium/pilot can diverge later; today every tier ships the documented default.
 *
 * This module is pure domain logic — no infrastructure. The persistence contract
 * is {@link SetupInstalmentRepository}; its adapter maps the lowercase statuses
 * here to the uppercase Prisma enum.
 *
 * @see CRM_DELIVERY_INTEGRATION §4.1 (portal repo) — the authoritative plan.
 */

export type SetupInstalmentStatus = 'due' | 'paid' | 'overdue';

/** Delivery tier governing the setup-fee plan. Mirrors the portal's tier vocabulary. */
export type DeliveryTier = 'core' | 'premium' | 'pilot';

/** A single computed instalment in a setup-fee plan. Money in minor units. */
export interface SetupInstalmentSpec {
  /** 1-based ordinal within the plan. */
  n: number;
  /** Amount in minor units (e.g. pence). */
  amountCents: number;
  /** ISO-4217 currency, e.g. "GBP". */
  currency: string;
  /** Always `'due'` for a freshly built plan. */
  status: SetupInstalmentStatus;
  /** When this instalment falls due (signature + offset). */
  dueAt: Date;
}

/** A persisted instalment as read back from the store. */
export interface SetupInstalmentRecord {
  n: number;
  amountCents: number;
  currency: string;
  status: SetupInstalmentStatus;
  dueAt: Date | null;
  paidAt: Date | null;
  stripeInvoiceId: string | null;
  /** Stripe-hosted payment page URL (invoice hosted_invoice_url); null until finalized. */
  hostedInvoiceUrl: string | null;
}

/** Per-tier plan shape: the instalment amounts (minor units) and their day offsets. */
export interface SetupPlanConfig {
  /** One amount per instalment, in minor units; length = instalment count. */
  amountsCents: number[];
  /** Day offset from signature for each instalment; same length as amountsCents. */
  dayOffsets: number[];
  currency: string;
}

export const DEFAULT_SETUP_FEE_CENTS = 16700; // £167
export const DEFAULT_SETUP_CURRENCY = 'GBP';

/** The documented default: 3 × £167 at day 0 / 7 / 14. */
const DEFAULT_PLAN: SetupPlanConfig = {
  amountsCents: [DEFAULT_SETUP_FEE_CENTS, DEFAULT_SETUP_FEE_CENTS, DEFAULT_SETUP_FEE_CENTS],
  dayOffsets: [0, 7, 14],
  currency: DEFAULT_SETUP_CURRENCY,
};

/**
 * Per-tier setup-fee plans. All tiers default to the standard 3 × £167 plan;
 * the per-tier indirection exists so premium/pilot numbers can be tuned in one
 * place once the business defines them — without touching the calculator.
 */
export const SETUP_PLANS: Record<DeliveryTier, SetupPlanConfig> = {
  core: DEFAULT_PLAN,
  premium: DEFAULT_PLAN,
  pilot: DEFAULT_PLAN,
};

export interface SetupInstalmentPlanInput {
  /** Contract signature date — day 0 of the schedule. */
  signedAt: Date;
  /** Delivery tier; defaults to `'core'`. */
  tier?: DeliveryTier;
}

/** Add whole days to a date in UTC, without mutating the input. */
function addDays(base: Date, days: number): Date {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Build the setup-fee instalment plan for a won deal. Pure: same inputs → same
 * specs. Every instalment starts `'due'`; the schedule is anchored on `signedAt`.
 */
export function buildSetupInstalmentPlan(input: SetupInstalmentPlanInput): SetupInstalmentSpec[] {
  const plan = SETUP_PLANS[input.tier ?? 'core'];
  return plan.amountsCents.map((amountCents, i) => ({
    n: i + 1,
    amountCents,
    currency: plan.currency,
    status: 'due' as const,
    dueAt: addDays(input.signedAt, plan.dayOffsets[i]),
  }));
}

/**
 * Persistence contract for setup-fee instalments. Implemented in the adapters
 * layer (Prisma in prod, in-memory in tests).
 *
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface SetupInstalmentRepository {
  /**
   * Persist the full instalment set for an opportunity. Idempotent on
   * (opportunityId, n): re-running with the same plan skips existing rows, so a
   * retried deal-won closure never duplicates instalments.
   */
  createForOpportunity(args: {
    opportunityId: string;
    tenantId: string;
    instalments: SetupInstalmentSpec[];
  }): Promise<void>;

  /** Load an opportunity's instalments ordered by `n` (tenant-scoped). */
  findByOpportunity(opportunityId: string, tenantId: string): Promise<SetupInstalmentRecord[]>;

  /**
   * Attach a Stripe invoice id (and its hosted payment URL) to one instalment,
   * after the invoice finalises. The URL is pushed to the portal's Pay button.
   */
  setStripeInvoiceId(args: {
    opportunityId: string;
    tenantId: string;
    n: number;
    stripeInvoiceId: string;
    hostedInvoiceUrl?: string | null;
  }): Promise<void>;

  /**
   * Mark the instalment carrying this Stripe invoice as PAID. Looked up by the
   * unique `stripeInvoiceId` because the `invoice.paid` webhook only knows the
   * invoice — not the opportunity/tenant. Idempotent: a no-op when no row
   * matches (e.g. an invoice unrelated to a setup-fee instalment).
   */
  markPaidByStripeInvoiceId(args: { stripeInvoiceId: string; paidAt: Date }): Promise<void>;
}
