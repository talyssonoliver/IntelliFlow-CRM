import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSubscriptionPortalSyncHandler } from '../subscription-portal-sync.handler';
import type { OutboxEvent } from '../../outbox/event-dispatcher';

function makeEvent(payload: Record<string, unknown>): OutboxEvent {
  return {
    id: 'evt_1',
    eventType: 'subscription.portal_sync_requested',
    aggregateId: 'sub_1',
    payload,
  } as unknown as OutboxEvent;
}

describe('createSubscriptionPortalSyncHandler', () => {
  let pushDelivery: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    pushDelivery = vi.fn().mockResolvedValue({ isFailure: false });
    logger = { info: vi.fn(), warn: vi.fn() };
  });

  const build = () => createSubscriptionPortalSyncHandler({ portalSync: { pushDelivery }, logger });

  it('pushes the same shape the inline webhook push used', async () => {
    await build()(
      makeEvent({
        slug: 'acme',
        subscriptionStatus: 'active',
        subscriptionRenewsAt: '2026-07-01T00:00:00.000Z',
      })
    );

    expect(pushDelivery).toHaveBeenCalledWith({
      slug: 'acme',
      subscriptionStatus: 'active',
      subscriptionRenewsAt: '2026-07-01T00:00:00.000Z',
    });
    expect(logger.info).toHaveBeenCalled();
  });

  it('defaults a missing renewal date to null', async () => {
    await build()(makeEvent({ slug: 'acme', subscriptionStatus: 'canceled' }));
    expect(pushDelivery).toHaveBeenCalledWith({
      slug: 'acme',
      subscriptionStatus: 'canceled',
      subscriptionRenewsAt: null,
    });
  });

  it('throws on a failed push so the outbox retries', async () => {
    pushDelivery.mockResolvedValue({ isFailure: true, error: { message: 'HTTP 503' } });
    await expect(build()(makeEvent({ slug: 'acme' }))).rejects.toThrow(
      '[subscription-portal-sync] push failed for acme: HTTP 503'
    );
  });

  it('skips (does not retry) an event with no slug', async () => {
    await build()(makeEvent({ subscriptionStatus: 'active' }));
    expect(pushDelivery).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
