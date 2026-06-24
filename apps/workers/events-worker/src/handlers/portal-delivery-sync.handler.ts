/**
 * Portal Delivery Sync Handler
 *
 * Consumes `opportunity.deal_won_enriched` from the outbox and pushes the won
 * deal into the Leangency portal: provision the tenant, then push the CRM-owned
 * delivery/billing facts (tier, signature, the setup-fee instalment set) so the
 * client dashboard reflects where things stand.
 *
 * Only fires for **portal deals** — opportunities whose `tenantSlug` was set at
 * close-time. Legacy / non-portal deals are skipped (grandfathering).
 *
 * Dependencies are typed structurally so the handler is unit-testable without
 * the concrete Prisma / HTTP adapters. Failures from provision/push throw, so
 * the outbox retries (both portal endpoints are idempotent).
 *
 * After provisioning + pushing, it also fires the setup-fee *invoicing*
 * (`invoiceSetupFee`, optional dep): now that `Opportunity.stripeCustomerId`
 * exists (with an owner-fallback + create chain), each DUE instalment is billed
 * via a finalised Stripe invoice. Best-effort + idempotent — a billing failure
 * never blocks delivery, and already-invoiced instalments are skipped.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (steps 7 + 8)
 */

import type { OutboxEvent } from '../outbox/event-dispatcher';

type DeliveryTierDb = 'CORE' | 'PREMIUM' | 'PILOT';
type DeliveryTierApi = 'core' | 'premium' | 'pilot';

interface OpportunityRoutingRow {
  tenantSlug: string | null;
  deliveryTier: DeliveryTierDb | null;
  name: string;
  account: { name: string } | null;
  contact: { email: string } | null;
}

/** Minimal Prisma surface the handler needs. */
export interface PortalSyncPrismaLike {
  opportunity: {
    findUnique(args: {
      where: { id: string };
      select: {
        tenantSlug: true;
        deliveryTier: true;
        name: true;
        account: { select: { name: true } };
        contact: { select: { email: true } };
      };
    }): Promise<OpportunityRoutingRow | null>;
  };
}

interface InstalmentRow {
  n: number;
  amountCents: number;
  currency: string;
  status: 'due' | 'paid' | 'overdue';
  dueAt: Date | null;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
}

/** Minimal SetupInstalment reader surface. */
export interface PortalSyncInstalmentReader {
  findByOpportunity(opportunityId: string, tenantId: string): Promise<InstalmentRow[]>;
}

interface SyncResult {
  isFailure: boolean;
  error?: { message: string };
}

/** Minimal PortalDeliverySync surface (the HttpPortalDeliverySyncAdapter). */
export interface PortalSyncClient {
  provisionTenant(input: {
    slug: string;
    name: string;
    authorizedEmails: string[];
    sourceLeadId?: string | null;
  }): Promise<SyncResult>;
  pushDelivery(input: {
    slug: string;
    tier?: DeliveryTierApi;
    phase?: 'pending_onboarding';
    signedAt?: string | null;
    crmDealId?: string | null;
    setupInstalments?: Array<{
      n: number;
      amountCents: number;
      currency: string;
      status: 'due' | 'paid' | 'overdue';
      dueAt?: string | null;
      paidAt?: string | null;
      paymentUrl?: string | null;
    }>;
  }): Promise<SyncResult>;
}

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface PortalDeliverySyncHandlerDeps {
  prisma: PortalSyncPrismaLike;
  setupInstalments: PortalSyncInstalmentReader;
  portalSync: PortalSyncClient;
  logger: LoggerLike;
  /**
   * Optional: bill the persisted setup-fee instalments (IFC-314 step 8). Wired in
   * the container to {@link invoiceSetupInstalments}. Best-effort — left undefined
   * (e.g. in unit tests / when Stripe is unconfigured) the deal still provisions +
   * pushes; only the charging is skipped.
   */
  invoiceSetupFee?: (args: { opportunityId: string; tenantId: string }) => Promise<void>;
}

/**
 * Build the `opportunity.deal_won_enriched` handler. Returns a function the
 * EventDispatcher can register.
 */
export function createPortalDeliverySyncHandler(deps: PortalDeliverySyncHandlerDeps) {
  return async (event: OutboxEvent): Promise<void> => {
    const payload = event.payload as {
      opportunityId?: string;
      tenantId?: string;
      closedAt?: string;
      opportunityName?: string;
    };
    const opportunityId = payload.opportunityId ?? event.aggregateId;
    const tenantId = payload.tenantId;

    if (!opportunityId || !tenantId) {
      deps.logger.warn(
        { eventId: event.id },
        '[portal-sync] missing opportunityId/tenantId; skipping'
      );
      return;
    }

    const opp = await deps.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        tenantSlug: true,
        deliveryTier: true,
        name: true,
        account: { select: { name: true } },
        contact: { select: { email: true } },
      },
    });

    if (!opp?.tenantSlug) {
      deps.logger.info(
        { opportunityId },
        '[portal-sync] no tenantSlug (not a portal deal); skipping'
      );
      return;
    }

    const slug = opp.tenantSlug;
    const ownerEmail = opp.contact?.email;
    if (!ownerEmail) {
      deps.logger.error(
        { opportunityId, slug },
        '[portal-sync] no contact email to own the portal; cannot provision; skipping'
      );
      return;
    }

    const name = opp.account?.name ?? opp.name ?? payload.opportunityName ?? slug;
    const tier = opp.deliveryTier ? (opp.deliveryTier.toLowerCase() as DeliveryTierApi) : undefined;

    // 1. Provision the tenant (idempotent: 409 slug_conflict = success in the adapter).
    const provision = await deps.portalSync.provisionTenant({
      slug,
      name,
      authorizedEmails: [ownerEmail],
      sourceLeadId: null,
    });
    if (provision.isFailure) {
      // Throw → outbox retries (likely transient: 5xx / network).
      throw new Error(`[portal-sync] provision failed for ${slug}: ${provision.error?.message}`);
    }

    // 2. Read the persisted instalment plan → portal payload (whole set, not deltas).
    const rows = await deps.setupInstalments.findByOpportunity(opportunityId, tenantId);
    const setupInstalments = toPortalInstalments(rows);

    // 3. Push the CRM-owned delivery/billing facts. CRM sets phase only once.
    const push = await deps.portalSync.pushDelivery({
      slug,
      tier,
      phase: 'pending_onboarding',
      signedAt: payload.closedAt ?? null,
      crmDealId: opportunityId,
      setupInstalments,
    });
    if (push.isFailure) {
      throw new Error(`[portal-sync] delivery push failed for ${slug}: ${push.error?.message}`);
    }

    deps.logger.info(
      { opportunityId, slug, instalments: setupInstalments.length },
      '[portal-sync] provisioned + pushed delivery'
    );

    // 4. IFC-314 step 8: bill the setup-fee instalments (best-effort; the helper
    // swallows its own errors, but guard here too so a throw can never undo the
    // already-succeeded provision + push).
    if (deps.invoiceSetupFee) {
      try {
        await deps.invoiceSetupFee({ opportunityId, tenantId });
        await rePushPaymentUrls(deps, { opportunityId, tenantId, slug });
      } catch (err) {
        deps.logger.error(
          { opportunityId, slug, error: err instanceof Error ? err.message : String(err) },
          '[portal-sync] setup-fee invoicing threw (non-fatal)'
        );
      }
    }
  };
}

/** Map persisted instalment rows to the portal push payload (whole set, not deltas). */
function toPortalInstalments(xs: InstalmentRow[]) {
  return xs.map((r) => ({
    n: r.n,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    // The portal renders a Pay button that redirects here; null until invoiced,
    // and null again once paid (the contract retains no payment URL for a paid
    // instalment — there is nothing left to pay).
    paymentUrl: r.status === 'paid' ? null : r.hostedInvoiceUrl,
  }));
}

/**
 * The deal-won push happens BEFORE invoicing, so it carries no payment URLs.
 * After invoicing, re-read (the rows now hold each finalized invoice's hosted
 * URL) and re-push so the portal's Pay buttons light up immediately. Best-effort:
 * a failure here never undoes the provision/push or the billing that already
 * succeeded (the next sync would carry the URLs anyway).
 */
async function rePushPaymentUrls(
  deps: PortalDeliverySyncHandlerDeps,
  ctx: { opportunityId: string; tenantId: string; slug: string }
): Promise<void> {
  const { opportunityId, tenantId, slug } = ctx;
  try {
    const rows = await deps.setupInstalments.findByOpportunity(opportunityId, tenantId);
    const withUrls = toPortalInstalments(rows);
    if (!withUrls.some((i) => i.paymentUrl)) return;
    const rePush = await deps.portalSync.pushDelivery({ slug, setupInstalments: withUrls });
    if (rePush.isFailure) {
      deps.logger.warn(
        { opportunityId, slug, error: rePush.error?.message },
        '[portal-sync] payment-URL re-push failed (non-fatal)'
      );
      return;
    }
    deps.logger.info(
      { opportunityId, slug },
      '[portal-sync] re-pushed instalments with payment URLs'
    );
  } catch (err) {
    deps.logger.warn(
      { opportunityId, slug, error: err instanceof Error ? err.message : String(err) },
      '[portal-sync] payment-URL re-push threw (non-fatal)'
    );
  }
}
