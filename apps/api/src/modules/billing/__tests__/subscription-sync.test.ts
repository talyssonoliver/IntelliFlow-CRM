import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSubscriptionSyncHandler,
  type SubscriptionWebhookEvent,
  type SubscriptionSyncDeps,
} from '../subscription-sync';

function makeEvent(overrides: Partial<SubscriptionWebhookEvent> = {}): SubscriptionWebhookEvent {
  return {
    type: 'customer.subscription.updated',
    subscriptionId: 'sub_1',
    customerId: 'cus_1',
    status: 'active',
    currentPeriodEnd: 1_780_000_000, // unix seconds
    cancelAtPeriodEnd: false,
    tenantId: 'tenant_1',
    tenantSlug: 'acme',
    ...overrides,
  };
}

function makeDeps() {
  const upsertFromWebhook = vi.fn().mockResolvedValue(undefined);
  const pushDelivery = vi.fn().mockResolvedValue({ isFailure: false });
  const deps: SubscriptionSyncDeps = {
    repo: { upsertFromWebhook } as any,
    portalSync: { pushDelivery } as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { deps, upsertFromWebhook, pushDelivery };
}

describe('createSubscriptionSyncHandler', () => {
  let h: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    h = makeDeps();
  });

  it('persists the subscription and pushes status for an engine subscription', async () => {
    const res = await createSubscriptionSyncHandler(h.deps)(makeEvent());

    expect(res).toEqual({ persisted: true, pushed: true });
    expect(h.upsertFromWebhook).toHaveBeenCalledWith({
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(1_780_000_000 * 1000),
      cancelAtPeriodEnd: false,
      tenantId: 'tenant_1',
      tenantSlug: 'acme',
    });
    expect(h.pushDelivery).toHaveBeenCalledWith({
      slug: 'acme',
      subscriptionStatus: 'active',
      subscriptionRenewsAt: new Date(1_780_000_000 * 1000).toISOString(),
    });
  });

  it('persists but does NOT push for a CRM SaaS-plan subscription (no tenantSlug)', async () => {
    const res = await createSubscriptionSyncHandler(h.deps)(makeEvent({ tenantSlug: undefined }));
    expect(res).toEqual({ persisted: true, pushed: false });
    expect(h.upsertFromWebhook).toHaveBeenCalledWith(expect.objectContaining({ tenantSlug: null }));
    expect(h.pushDelivery).not.toHaveBeenCalled();
  });

  it('forces canceled on a subscription.deleted event', async () => {
    await createSubscriptionSyncHandler(h.deps)(
      makeEvent({ type: 'customer.subscription.deleted', status: 'active' })
    );
    expect(h.upsertFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELED' })
    );
    expect(h.pushDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: 'canceled' })
    );
  });

  it('handles a null currentPeriodEnd', async () => {
    await createSubscriptionSyncHandler(h.deps)(makeEvent({ currentPeriodEnd: null }));
    expect(h.upsertFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: null })
    );
    expect(h.pushDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionRenewsAt: null })
    );
  });

  it('ignores non-subscription event types', async () => {
    const res = await createSubscriptionSyncHandler(h.deps)(makeEvent({ type: 'invoice.paid' }));
    expect(res).toEqual({ persisted: false, pushed: false });
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
  });

  it('skips when tenantId is absent', async () => {
    const res = await createSubscriptionSyncHandler(h.deps)(makeEvent({ tenantId: undefined }));
    expect(res).toEqual({ persisted: false, pushed: false });
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
    expect(h.deps.logger.warn).toHaveBeenCalled();
  });

  it('persists even when there is no portalSync configured', async () => {
    const deps = { ...h.deps, portalSync: undefined };
    const res = await createSubscriptionSyncHandler(deps)(makeEvent());
    expect(res).toEqual({ persisted: true, pushed: false });
    expect(h.upsertFromWebhook).toHaveBeenCalled();
  });

  it('returns pushed:false (best-effort) when the portal push fails', async () => {
    h.pushDelivery.mockResolvedValue({ isFailure: true, error: { message: 'HTTP 500' } });
    const res = await createSubscriptionSyncHandler(h.deps)(makeEvent());
    expect(res).toEqual({ persisted: true, pushed: false });
    expect(h.deps.logger.error).toHaveBeenCalled();
  });
});
