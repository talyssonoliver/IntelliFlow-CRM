/**
 * billing.handleSubscriptionWebhook — engine-subscription push goes through the
 * transactional outbox (domain_events) instead of a fire-and-forget portal call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { billingRouter } from '../billing.router';
import { createTestContext, prismaMock } from '../../../test/setup';

const EVENT = {
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'past_due',
      current_period_end: 1_780_000_000,
      cancel_at_period_end: false,
      metadata: { tenantId: 'tenant_1', tenantSlug: 'acme' },
    },
  },
};

function makeCtx(adapters: Record<string, unknown>, operator = true) {
  const container = { get: vi.fn().mockReturnValue(adapters) };
  const ctx = createTestContext({ container } as never);
  // The procedure is platform-operator only: a verified email on PLATFORM_ADMIN_EMAILS.
  const user = ctx.user as { email?: string; emailVerified?: boolean };
  user.email = operator ? 'ops@leangency.test' : 'someone@acme.test';
  user.emailVerified = true;
  return ctx;
}

describe('billing.handleSubscriptionWebhook outbox routing', () => {
  const upsertFromWebhook = vi.fn();
  const pushDelivery = vi.fn();

  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@leangency.test';
    upsertFromWebhook.mockReset().mockResolvedValue(undefined);
    pushDelivery.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('is FORBIDDEN for anyone who is not a platform operator (it trusts its JSON input)', async () => {
    const ctx = makeCtx(
      { stripeSubscriptionRepository: { upsertFromWebhook }, portalDeliverySync: { pushDelivery } },
      false
    );

    await expect(
      billingRouter.createCaller(ctx as never).handleSubscriptionWebhook(EVENT)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(upsertFromWebhook).not.toHaveBeenCalled();
    expect(prismaMock.domainEvent.create).not.toHaveBeenCalled();
  });

  it('enqueues the push as a domain event with the same payload, without calling the portal', async () => {
    prismaMock.domainEvent.create.mockResolvedValueOnce({ id: 'evt_1' } as never);
    const ctx = makeCtx({
      stripeSubscriptionRepository: { upsertFromWebhook },
      portalDeliverySync: { pushDelivery },
    });

    await billingRouter.createCaller(ctx as never).handleSubscriptionWebhook(EVENT);

    expect(pushDelivery).not.toHaveBeenCalled();
    const arg = prismaMock.domainEvent.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      eventType: 'subscription.portal_sync_requested',
      aggregateType: 'StripeSubscription',
      aggregateId: 'sub_1',
      tenantId: 'tenant_1',
      payload: {
        slug: 'acme',
        subscriptionStatus: 'past_due',
        subscriptionRenewsAt: new Date(1_780_000_000 * 1000).toISOString(),
      },
      metadata: { tenantId: 'tenant_1', version: '1.0' },
    });
  });

  it('does not enqueue when the portal sync is not configured', async () => {
    const ctx = makeCtx({
      stripeSubscriptionRepository: { upsertFromWebhook },
      portalDeliverySync: null,
    });

    await billingRouter.createCaller(ctx as never).handleSubscriptionWebhook(EVENT);

    expect(upsertFromWebhook).toHaveBeenCalled();
    expect(prismaMock.domainEvent.create).not.toHaveBeenCalled();
  });

  it('fails the webhook (so Stripe redelivers) when the outbox write fails', async () => {
    prismaMock.domainEvent.create.mockRejectedValueOnce(new Error('db down'));
    const ctx = makeCtx({
      stripeSubscriptionRepository: { upsertFromWebhook },
      portalDeliverySync: { pushDelivery },
    });

    await expect(
      billingRouter.createCaller(ctx as never).handleSubscriptionWebhook(EVENT)
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('still swallows other sync failures (persist error is non-fatal)', async () => {
    upsertFromWebhook.mockRejectedValueOnce(new Error('upsert failed'));
    const ctx = makeCtx({
      stripeSubscriptionRepository: { upsertFromWebhook },
      portalDeliverySync: { pushDelivery },
    });

    await expect(
      billingRouter.createCaller(ctx as never).handleSubscriptionWebhook(EVENT)
    ).resolves.toBeDefined();
    expect(prismaMock.domainEvent.create).not.toHaveBeenCalled();
  });
});
