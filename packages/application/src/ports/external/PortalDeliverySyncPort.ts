import { Result, DomainError } from '@intelliflow/domain';

/**
 * Portal Delivery Sync Port
 *
 * The CRM→portal return path. On a won deal the CRM provisions the tenant in the
 * Leangency portal, then pushes CRM-owned delivery/billing facts so the client
 * dashboard reflects where setup-fee instalments and the engine subscription stand.
 *
 * Authoritative contract: the portal's `POST /api/internal/tenants` (provision)
 * and `POST /api/internal/delivery` (partial upsert). Auth is the shared
 * service-to-service secret (`PORTAL_INTERNAL_SECRET`), the same one the portal
 * already uses on the inbound path — reversed.
 *
 * Ownership boundary (enforced by simply not sending portal-owned fields):
 * - **CRM owns**: `tier`, `signedAt`, `crmDealId`, `setupInstalments`,
 *   `subscriptionStatus`, `subscriptionRenewsAt`, and the one-time
 *   `phase: 'pending_onboarding'` set on deal-won.
 * - **Portal owns**: every subsequent `phase`, the 14-day SLA clock, and the
 *   onboarding/homepage/launch/pause timestamps — the CRM must NOT send those.
 *
 * Implementations are thin single-shot HTTP calls; at-least-once delivery is the
 * `domain_events` outbox's job. The portal endpoints are idempotent, so retries
 * are safe and the whole `setupInstalments` set is re-sent on every change.
 *
 * @see CloseDealWonUseCase (IFC-314 step 6) — the deal-won trigger.
 */

export interface PortalTenantProvisionInput {
  /** Tenant slug (portal subdomain + DB key). */
  slug: string;
  /** Display name of the agency client. */
  name: string;
  /** Authorised portal logins; the first email is granted the `owner` role. */
  authorizedEmails: string[];
  /** Optional initial proposal config (Zod-validated portal-side). */
  proposalConfig?: unknown;
  /** Originating lead id, for traceability. */
  sourceLeadId?: string | null;
}

/** A single setup-fee instalment as reflected to the portal. Money in minor units. */
export interface PortalSetupInstalmentInput {
  /** 1..3 — ordinal within the setup-fee plan. */
  n: number;
  /** Amount in minor units (e.g. pence). */
  amountCents: number;
  /** ISO-4217 currency, e.g. "GBP". */
  currency: string;
  status: 'due' | 'paid' | 'overdue';
  /** ISO timestamp the instalment is/was due. */
  dueAt?: string | null;
  /** ISO timestamp the instalment was paid; null until paid. */
  paidAt?: string | null;
}

export interface PortalDeliveryPushInput {
  /** Tenant slug; the tenant must already exist (provision first). */
  slug: string;
  tier?: 'core' | 'premium' | 'pilot';
  /** CRM sets ONLY `pending_onboarding` (on deal-won); the portal drives the rest. */
  phase?: 'pending_onboarding';
  /** Contract signature date (ISO) — drives instalment due dates. */
  signedAt?: string | null;
  /** intelliFlow `Opportunity` id, for traceability. */
  crmDealId?: string | null;
  /** The full instalment set, re-sent whole on each change (not deltas). */
  setupInstalments?: PortalSetupInstalmentInput[];
  /** Engine subscription state, mapped to the portal's 5-value enum. */
  subscriptionStatus?: 'none' | 'active' | 'past_due' | 'canceled' | 'paused';
  /** ISO timestamp of the next subscription renewal. */
  subscriptionRenewsAt?: string | null;
}

export interface PortalDeliverySyncPort {
  /**
   * `POST /api/internal/tenants` — provision the tenant the delivery FK needs.
   * Idempotent on slug: a `409 slug_conflict` means the tenant already exists and
   * is treated as success, so a retried deal-won push self-heals.
   */
  provisionTenant(input: PortalTenantProvisionInput): Promise<Result<void, DomainError>>;

  /**
   * `POST /api/internal/delivery` — partial upsert of CRM-owned delivery/billing
   * fields. Only the fields present are written; omitted fields are left
   * untouched. Returns a failure on `404 tenant_not_found` so the caller can
   * retry after provisioning wins.
   */
  pushDelivery(input: PortalDeliveryPushInput): Promise<Result<void, DomainError>>;
}
