/**
 * Subscription webhook sync (IFC-314, step 4).
 *
 * Persists Stripe subscription status from `customer.subscription.*` webhooks and
 * — for ENGINE subscriptions (those stamped with `metadata.tenantSlug`) — pushes
 * the mapped status to the portal so the client dashboard reflects billing.
 *
 * The CRM's own SaaS-plan subscriptions arrive without a `tenantSlug`: they are
 * persisted but not pushed (the slug is the discriminator).
 *
 * Pure of tRPC/Stripe SDK — the webhook procedure normalises its input into
 * {@link SubscriptionWebhookEvent} and calls the handler, so this is unit-testable.
 */

import type { StripeSubscriptionRepository } from '@intelliflow/application';
import {
  toDbSubscriptionStatus,
  mapStripeToPortalSubscriptionStatus,
  type PortalSubscriptionStatus,
} from '@intelliflow/domain';

export interface SubscriptionWebhookEvent {
  /** e.g. customer.subscription.created | .updated | .deleted */
  type: string;
  subscriptionId: string;
  customerId: string;
  /** Raw Stripe status (lowercase). Ignored for `.deleted` (forced to canceled). */
  status: string;
  /** Unix seconds, or null. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** CRM tenant scope (subscription metadata.tenantId). */
  tenantId?: string;
  /** Portal slug — present only for engine subscriptions (metadata.tenantSlug). */
  tenantSlug?: string;
}

interface PortalSyncClient {
  pushDelivery(input: {
    slug: string;
    subscriptionStatus?: PortalSubscriptionStatus;
    subscriptionRenewsAt?: string | null;
  }): Promise<{ isFailure: boolean; error?: { message: string } }>;
}

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface SubscriptionSyncDeps {
  repo: StripeSubscriptionRepository;
  /** Optional — only push when the portal sync is configured. */
  portalSync?: PortalSyncClient;
  logger: LoggerLike;
}

export interface SubscriptionSyncResult {
  persisted: boolean;
  pushed: boolean;
}

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export function createSubscriptionSyncHandler(deps: SubscriptionSyncDeps) {
  return async (event: SubscriptionWebhookEvent): Promise<SubscriptionSyncResult> => {
    if (!SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
      return { persisted: false, pushed: false };
    }
    if (!event.tenantId) {
      deps.logger.warn(
        { subscriptionId: event.subscriptionId, type: event.type },
        '[subscription-sync] no tenantId in subscription metadata; skipping'
      );
      return { persisted: false, pushed: false };
    }

    // A deletion is a cancellation regardless of the carried status.
    const rawStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : event.status;
    const renewsAt =
      event.currentPeriodEnd !== null ? new Date(event.currentPeriodEnd * 1000) : null;

    await deps.repo.upsertFromWebhook({
      stripeSubscriptionId: event.subscriptionId,
      stripeCustomerId: event.customerId,
      status: toDbSubscriptionStatus(rawStatus),
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      tenantId: event.tenantId,
      tenantSlug: event.tenantSlug ?? null,
    });

    // Engine subscription → reflect status on the portal (best-effort; a portal
    // outage must not fail the Stripe webhook, which would retry the whole event).
    if (event.tenantSlug && deps.portalSync) {
      const push = await deps.portalSync.pushDelivery({
        slug: event.tenantSlug,
        subscriptionStatus: mapStripeToPortalSubscriptionStatus(rawStatus),
        subscriptionRenewsAt: renewsAt ? renewsAt.toISOString() : null,
      });
      if (push.isFailure) {
        deps.logger.error(
          { slug: event.tenantSlug, error: push.error?.message },
          '[subscription-sync] portal push failed (persisted; will self-heal on next event)'
        );
        return { persisted: true, pushed: false };
      }
      return { persisted: true, pushed: true };
    }

    return { persisted: true, pushed: false };
  };
}
