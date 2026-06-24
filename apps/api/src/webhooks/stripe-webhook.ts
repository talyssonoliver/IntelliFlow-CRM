/**
 * Verified Stripe webhook entry point (IFC-314, step 3).
 *
 * Closes the audit's security gap: the legacy tRPC `handleSubscriptionWebhook`
 * trusted unverified, JSON-parsed input. tRPC discards the raw bytes that Stripe
 * signature verification needs, so the *verified* entry point is a thin raw-body
 * route on the SAME apps/api service (mounted in http-server.ts) — NOT a new
 * system. It reuses the existing, tested {@link WebhookHandler} +
 * {@link StripeSignatureVerifier} (timestamp tolerance + timing-safe compare +
 * idempotency dedup) and dispatches verified events to the shared
 * subscription-sync (persist + portal reflect) and module-sync logic.
 *
 * Fails CLOSED: if STRIPE_WEBHOOK_SECRET is unset the route does not process the
 * event (it cannot verify it), so an unverified event is never trusted.
 */

import { WebhookHandler, SignatureVerifiers, type WebhookHandlerResult } from './handler';
import {
  createSubscriptionSyncHandler,
  type SubscriptionWebhookEvent,
} from '../modules/billing/subscription-sync';
import type { StripeSubscriptionRepository, PortalSubscriptionStatus } from '@intelliflow/domain';

const STRIPE_SOURCE = 'stripe';

const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

// IFC-314 step 8: a paid setup-fee invoice marks its instalment PAID.
const INVOICE_EVENTS = ['invoice.paid'];
const ALLOWED_EVENTS = [...SUBSCRIPTION_EVENTS, ...INVOICE_EVENTS];

/** One persisted instalment row (the subset the paid re-push needs). */
interface InstalmentRow {
  n: number;
  amountCents: number;
  currency: string;
  status: 'due' | 'paid' | 'overdue';
  dueAt: Date | null;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
}

/** Mark a setup-fee instalment paid by its (unique) Stripe invoice id. */
interface SetupInstalmentPaidWriter {
  /**
   * Returns the row's ids + portal slug on a match (null otherwise) so the caller
   * can re-push the now-paid set to the portal.
   */
  markPaidByStripeInvoiceId(args: {
    stripeInvoiceId: string;
    paidAt: Date;
  }): Promise<{ opportunityId: string; tenantId: string; tenantSlug: string | null } | null>;
  /** Optional: re-read the whole set so the paid status reflects on the portal. */
  findByOpportunity?(opportunityId: string, tenantId: string): Promise<InstalmentRow[]>;
}

interface PortalSyncClient {
  pushDelivery(input: {
    slug: string;
    subscriptionStatus?: PortalSubscriptionStatus;
    subscriptionRenewsAt?: string | null;
    setupInstalments?: Array<{
      n: number;
      amountCents: number;
      currency: string;
      status: 'due' | 'paid' | 'overdue';
      dueAt?: string | null;
      paidAt?: string | null;
      paymentUrl?: string | null;
    }>;
  }): Promise<{ isFailure: boolean; error?: { message: string } }>;
}

interface ModuleAccessLike {
  syncModulesToPlan(tenantId: string, planTier: string): Promise<string[]>;
}

export interface StripeWebhookDeps {
  subscriptionRepository: StripeSubscriptionRepository;
  portalSync?: PortalSyncClient | null;
  /** Optional: sync TenantModules on a plan change (parity with the legacy handler). */
  moduleAccess?: ModuleAccessLike | null;
  /** Optional: mark setup-fee instalments paid on `invoice.paid` (IFC-314 step 8). */
  setupInstalments?: SetupInstalmentPaidWriter | null;
  /** Stripe webhook signing secret (whsec_…). */
  webhookSecret: string;
  logger?: {
    info(o: unknown, m?: string): void;
    warn(o: unknown, m?: string): void;
    error(o: unknown, m?: string): void;
  };
}

const noopLogger = { info() {}, warn() {}, error() {} };

/** Stripe `data.object` shape we read (a subscription). */
interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { metadata?: Record<string, string> } }> };
}

/**
 * Build a {@link WebhookHandler} configured for verified Stripe subscription
 * events. Returns the handler — call `.handleRequest('stripe', rawBody, headers)`.
 */
export function buildStripeWebhookHandler(deps: StripeWebhookDeps): WebhookHandler {
  const logger = deps.logger ?? noopLogger;
  const handler = new WebhookHandler();

  handler.registerSource({
    source: STRIPE_SOURCE,
    secret: deps.webhookSecret,
    signatureVerifier: SignatureVerifiers.stripe(),
    enabled: true,
    allowedEvents: ALLOWED_EVENTS,
  });

  const syncSubscription = createSubscriptionSyncHandler({
    repo: deps.subscriptionRepository,
    portalSync: deps.portalSync ?? undefined,
    logger,
  });

  handler.getRouter().onAll(async (event) => {
    // IFC-314 step 8: a paid setup-fee invoice → mark its instalment PAID.
    if (INVOICE_EVENTS.includes(event.type)) {
      await handleInvoicePaid(deps, event, logger);
      return;
    }

    if (!SUBSCRIPTION_EVENTS.includes(event.type)) return;

    // WebhookHandler maps `payload = parsed.data`, so the subscription is at .object.
    const obj = (event.payload as { object?: StripeSubscriptionObject }).object;
    if (!obj) {
      logger.warn({ eventId: event.id }, '[stripe-webhook] no data.object on event');
      return;
    }

    const mapped: SubscriptionWebhookEvent = {
      type: event.type,
      subscriptionId: obj.id,
      customerId: obj.customer,
      status: obj.status ?? 'active',
      currentPeriodEnd: obj.current_period_end ?? null,
      cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
      tenantId: obj.metadata?.tenantId,
      tenantSlug: obj.metadata?.tenantSlug,
    };
    await syncSubscription(mapped);

    // Parity with the legacy handler: sync TenantModules on a plan change.
    const planTier = obj.items?.data?.[0]?.price?.metadata?.planTier?.toUpperCase();
    if (deps.moduleAccess && mapped.tenantId && planTier) {
      try {
        await deps.moduleAccess.syncModulesToPlan(mapped.tenantId, planTier);
      } catch (err) {
        logger.error({ err }, '[stripe-webhook] module sync failed (non-fatal)');
      }
    }
  });

  return handler;
}

type Logger = NonNullable<StripeWebhookDeps['logger']>;

/**
 * Handle an `invoice.paid` event: mark the matching setup-fee instalment paid
 * (no-op when {@link StripeWebhookDeps.setupInstalments} is absent) and re-push
 * the set so the portal reflects the payment immediately. `invoice.paid` also
 * fires for subscription-renewal invoices, which match no instalment — the
 * writer returns null then and nothing is logged/pushed.
 */
async function handleInvoicePaid(
  deps: Pick<StripeWebhookDeps, 'setupInstalments' | 'portalSync'>,
  event: { id: string; payload: unknown },
  logger: Logger
): Promise<void> {
  const invoice = (
    event.payload as {
      object?: { id?: string; status_transitions?: { paid_at?: number | null } };
    }
  ).object;
  if (!invoice?.id) {
    logger.warn({ eventId: event.id }, '[stripe-webhook] invoice event without object.id');
    return;
  }
  if (!deps.setupInstalments) return;

  const paidUnix = invoice.status_transitions?.paid_at;
  const paidAt = typeof paidUnix === 'number' ? new Date(paidUnix * 1000) : new Date();
  const ctx = await deps.setupInstalments.markPaidByStripeInvoiceId({
    stripeInvoiceId: invoice.id,
    paidAt,
  });
  // Only log a "marked paid" line when a row was actually updated (ctx !== null),
  // so a renewal invoice does not produce a misleading log.
  if (ctx) {
    logger.info(
      { eventId: event.id, invoiceId: invoice.id },
      '[stripe-webhook] setup-fee instalment marked paid'
    );
  }
  // Re-push so the portal reflects the payment immediately. No-op when ctx is
  // null (rePushPaidToPortal guards on it internally).
  await rePushPaidToPortal(deps, ctx, event.id, logger);
}

/**
 * After an instalment is marked paid, re-push the whole instalment set to the
 * portal so it reflects the payment immediately (instead of showing it as still
 * due until the next deal sync). Best-effort: needs the slug (resolved by the
 * repo) + a reader + a portal client; any failure is logged, never thrown.
 */
async function rePushPaidToPortal(
  deps: Pick<StripeWebhookDeps, 'portalSync' | 'setupInstalments'>,
  ctx: { opportunityId: string; tenantId: string; tenantSlug: string | null } | null,
  eventId: string,
  logger: Logger
): Promise<void> {
  const reader = deps.setupInstalments?.findByOpportunity;
  if (!ctx?.tenantSlug || !deps.portalSync || !reader) return;
  try {
    const rows = await reader(ctx.opportunityId, ctx.tenantId);
    const res = await deps.portalSync.pushDelivery({
      slug: ctx.tenantSlug,
      setupInstalments: rows.map((r) => ({
        n: r.n,
        amountCents: r.amountCents,
        currency: r.currency,
        status: r.status,
        dueAt: r.dueAt ? r.dueAt.toISOString() : null,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        // Contract: paymentUrl is null once paid (nothing left to pay). Only a
        // still-due/overdue instalment carries its hosted invoice URL.
        paymentUrl: r.status === 'paid' ? null : r.hostedInvoiceUrl,
      })),
    });
    if (res.isFailure) {
      logger.warn(
        { eventId, slug: ctx.tenantSlug, error: res.error?.message },
        '[stripe-webhook] paid re-push failed (non-fatal)'
      );
      return;
    }
    logger.info(
      { eventId, slug: ctx.tenantSlug },
      '[stripe-webhook] re-pushed paid instalment set to portal'
    );
  } catch (err) {
    logger.warn(
      { eventId, slug: ctx.tenantSlug, error: err instanceof Error ? err.message : String(err) },
      '[stripe-webhook] paid re-push threw (non-fatal)'
    );
  }
}

/**
 * Process a raw Stripe webhook request. Fails CLOSED when the signing secret is
 * absent — an unverifiable event is rejected, never trusted.
 */
export async function processStripeWebhook(
  rawBody: string,
  headers: Record<string, string>,
  deps: Omit<StripeWebhookDeps, 'webhookSecret'> & { webhookSecret?: string }
): Promise<WebhookHandlerResult> {
  if (!deps.webhookSecret) {
    return {
      success: false,
      message: 'Stripe webhook secret not configured',
      statusCode: 503,
      retryable: false,
    };
  }
  const handler = buildStripeWebhookHandler({ ...deps, webhookSecret: deps.webhookSecret });
  return handler.handleRequest(STRIPE_SOURCE, rawBody, headers);
}
