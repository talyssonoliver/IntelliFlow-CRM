/**
 * Subscription Portal Sync Handler
 *
 * Consumes `subscription.portal_sync_requested` from the outbox and pushes the
 * engine-subscription status to the Leangency portal (`pushDelivery`). The API's
 * Stripe webhook enqueues the event instead of calling the portal inline, so a
 * portal outage no longer loses the push: a failed push throws, and the outbox
 * poller retries with backoff before dead-lettering (the portal endpoint is an
 * idempotent partial upsert, so retries are safe).
 *
 * The payload is exactly what the inline push used to send:
 * `{ slug, subscriptionStatus, subscriptionRenewsAt }`.
 */

import type { OutboxEvent } from '../outbox/event-dispatcher';

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

/** Minimal PortalDeliverySync surface (the HttpPortalDeliverySyncAdapter). */
export interface SubscriptionPortalSyncClient {
  pushDelivery(input: {
    slug: string;
    subscriptionStatus?: 'none' | 'active' | 'past_due' | 'canceled' | 'paused';
    subscriptionRenewsAt?: string | null;
  }): Promise<{ isFailure: boolean; error?: { message: string } }>;
}

export interface SubscriptionPortalSyncDeps {
  portalSync: SubscriptionPortalSyncClient;
  logger: LoggerLike;
}

export function createSubscriptionPortalSyncHandler(deps: SubscriptionPortalSyncDeps) {
  return async (event: OutboxEvent): Promise<void> => {
    const payload = event.payload as {
      slug?: unknown;
      subscriptionStatus?: SubscriptionPortalSyncClientStatus;
      subscriptionRenewsAt?: string | null;
    };

    if (typeof payload.slug !== 'string' || payload.slug === '') {
      // A malformed event can never succeed; skip rather than retry into the DLQ.
      deps.logger.warn({ eventId: event.id }, '[subscription-portal-sync] no slug; skipping');
      return;
    }

    const push = await deps.portalSync.pushDelivery({
      slug: payload.slug,
      subscriptionStatus: payload.subscriptionStatus,
      subscriptionRenewsAt: payload.subscriptionRenewsAt ?? null,
    });
    if (push.isFailure) {
      // Throw → outbox retries.
      throw new Error(
        `[subscription-portal-sync] push failed for ${payload.slug}: ${push.error?.message}`
      );
    }

    deps.logger.info(
      { slug: payload.slug, status: payload.subscriptionStatus },
      '[subscription-portal-sync] pushed subscription status'
    );
  };
}

type SubscriptionPortalSyncClientStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'paused';
