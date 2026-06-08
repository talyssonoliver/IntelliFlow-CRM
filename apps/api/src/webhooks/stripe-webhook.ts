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

interface PortalSyncClient {
  pushDelivery(input: {
    slug: string;
    subscriptionStatus?: PortalSubscriptionStatus;
    subscriptionRenewsAt?: string | null;
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
    allowedEvents: SUBSCRIPTION_EVENTS,
  });

  const syncSubscription = createSubscriptionSyncHandler({
    repo: deps.subscriptionRepository,
    portalSync: deps.portalSync ?? undefined,
    logger,
  });

  handler.getRouter().onAll(async (event) => {
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
