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
import type { PrismaClient } from '@intelliflow/db';
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

/** Outbox event type consumed by the events-worker subscription-portal-sync handler. */
export const SUBSCRIPTION_PORTAL_SYNC_EVENT = 'subscription.portal_sync_requested';

/** Thrown when the portal push cannot be enqueued, so the webhook can 5xx and Stripe retries. */
export class PortalPushEnqueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalPushEnqueueError';
  }
}

/** The exact payload the inline push used to send to the portal. */
export interface PortalSubscriptionPush {
  slug: string;
  subscriptionStatus: PortalSubscriptionStatus;
  subscriptionRenewsAt: string | null;
}

export interface SubscriptionSyncDeps {
  repo: StripeSubscriptionRepository;
  /** Optional — only push when the portal sync is configured. */
  portalSync?: PortalSyncClient;
  /**
   * Preferred over `portalSync`: enqueue the push on the transactional outbox
   * (retried by the events-worker) instead of calling the portal inline.
   */
  enqueuePortalPush?: (
    push: PortalSubscriptionPush,
    ctx: { tenantId: string; subscriptionId: string }
  ) => Promise<void>;
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

/** Build an `enqueuePortalPush` that writes the push to the `domain_events` outbox. */
export function createOutboxPortalPushEnqueuer(
  prisma: Pick<PrismaClient, 'domainEvent'>
): NonNullable<SubscriptionSyncDeps['enqueuePortalPush']> {
  return async (push, { tenantId, subscriptionId }) => {
    await prisma.domainEvent.create({
      data: {
        eventType: SUBSCRIPTION_PORTAL_SYNC_EVENT,
        aggregateType: 'StripeSubscription',
        aggregateId: subscriptionId,
        payload: { ...push },
        metadata: {
          tenantId,
          correlationId: subscriptionId,
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
        tenantId,
      },
    });
  };
}

async function enqueuePush(
  enqueue: NonNullable<SubscriptionSyncDeps['enqueuePortalPush']>,
  {
    tenantId,
    subscriptionId,
    ...push
  }: PortalSubscriptionPush & {
    tenantId: string;
    subscriptionId: string;
  }
): Promise<void> {
  try {
    await enqueue(push, { tenantId, subscriptionId });
  } catch (err) {
    throw new PortalPushEnqueueError(
      `portal push enqueue failed for ${push.slug}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

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

    // Engine subscription → reflect status on the portal. Via the outbox the push
    // is durable and retried by the events-worker; an enqueue failure throws so the
    // webhook 5xxs and Stripe redelivers (the persist above is an idempotent upsert).
    if (event.tenantSlug && deps.enqueuePortalPush) {
      await enqueuePush(deps.enqueuePortalPush, {
        slug: event.tenantSlug,
        subscriptionStatus: mapStripeToPortalSubscriptionStatus(rawStatus),
        subscriptionRenewsAt: renewsAt ? renewsAt.toISOString() : null,
        tenantId: event.tenantId,
        subscriptionId: event.subscriptionId,
      });
      return { persisted: true, pushed: false };
    }

    // Legacy inline path (best-effort; a portal outage must not fail the webhook).
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
