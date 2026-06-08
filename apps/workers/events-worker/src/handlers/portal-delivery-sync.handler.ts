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
 * NOTE: the Stripe setup-fee *invoicing* (finalize instalment-1, day-7/14 jobs,
 * invoice.paid → status) is intentionally NOT done here — there is no
 * opportunity→Stripe-customer link in the schema today (stripeCustomerId lives
 * on User), so charging is a separate billing wire. The instalment *amounts and
 * due dates* are still reflected to the portal from the persisted plan.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (step 7)
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
    const setupInstalments = rows.map((r) => ({
      n: r.n,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    }));

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
  };
}
