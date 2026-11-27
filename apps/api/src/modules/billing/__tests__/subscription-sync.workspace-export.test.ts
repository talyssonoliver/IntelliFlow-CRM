/**
 * Trigger on cancel: a subscription that ends starts the workspace data export at once
 * (agreement clause 5). Covers the sync handler's hook and the hook that queues the export.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createSubscriptionSyncHandler,
  type SubscriptionSyncDeps,
  type SubscriptionWebhookEvent,
} from '../subscription-sync';
import { createEndedSubscriptionExportHook } from '../../workspace-export/ended-subscription-export';

function event(over: Partial<SubscriptionWebhookEvent> = {}): SubscriptionWebhookEvent {
  return {
    type: 'customer.subscription.deleted',
    subscriptionId: 'sub_1',
    customerId: 'cus_1',
    status: 'canceled',
    currentPeriodEnd: 1_780_000_000,
    cancelAtPeriodEnd: false,
    tenantId: 'tenant_1',
    ...over,
  };
}

function handler(onSubscriptionEnded: ReturnType<typeof vi.fn> | undefined) {
  const hook = onSubscriptionEnded as SubscriptionSyncDeps['onSubscriptionEnded'];
  const upsertFromWebhook = vi.fn().mockResolvedValue(undefined);
  const run = createSubscriptionSyncHandler({
    repo: { upsertFromWebhook } as never,
    onSubscriptionEnded: hook,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { run, upsertFromWebhook };
}

describe('subscription sync: ended subscription starts the export', () => {
  it('fires for a deleted subscription, after it is persisted as CANCELED', async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    const { run, upsertFromWebhook } = handler(hook);
    await run(event());
    expect(upsertFromWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELED' }));
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith({ tenantId: 'tenant_1', subscriptionId: 'sub_1' });
    expect(upsertFromWebhook.mock.invocationCallOrder[0]!).toBeLessThan(
      hook.mock.invocationCallOrder[0]!
    );
  });

  it('fires when an update carries the canceled status', async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    await handler(hook).run(event({ type: 'customer.subscription.updated', status: 'canceled' }));
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])(
    'does not fire for a %s subscription',
    async (status) => {
      const hook = vi.fn().mockResolvedValue(undefined);
      await handler(hook).run(event({ type: 'customer.subscription.updated', status }));
      expect(hook).not.toHaveBeenCalled();
    }
  );

  it('does not fire when scheduled to cancel at period end (still a customer)', async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    await handler(hook).run(
      event({ type: 'customer.subscription.updated', status: 'active', cancelAtPeriodEnd: true })
    );
    expect(hook).not.toHaveBeenCalled();
  });

  it('does nothing without a tenant, and works without a hook', async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    await handler(hook).run(event({ tenantId: undefined }));
    expect(hook).not.toHaveBeenCalled();
    await expect(handler(undefined).run(event())).resolves.toMatchObject({ persisted: true });
  });

  it('fails the webhook when the export cannot be recorded, so Stripe redelivers', async () => {
    const hook = vi.fn().mockRejectedValue(new Error('db down'));
    const { run, upsertFromWebhook } = handler(hook);
    await expect(run(event())).rejects.toThrow('db down');
    expect(upsertFromWebhook).toHaveBeenCalled();
  });
});

describe('createEndedSubscriptionExportHook', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  function prisma(over: Record<string, unknown> = {}) {
    return {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }) },
      stripeSubscription: { count: vi.fn().mockResolvedValue(0) },
      workspaceExportRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'req_1' }),
      },
      ...over,
    } as never;
  }

  it('creates a SUBSCRIPTION_ENDED request and queues the job at once', async () => {
    const db = prisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    await createEndedSubscriptionExportHook(
      db,
      logger,
      enqueue
    )({
      tenantId: 'tenant_1',
      subscriptionId: 'sub_1',
    });
    const created = (db as any).workspaceExportRequest.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: 'tenant_1',
      trigger: 'SUBSCRIPTION_ENDED',
      subscriptionId: 'sub_1',
    });
    expect(created.requestedById).toBeUndefined();
    expect(enqueue).toHaveBeenCalledWith({ requestId: 'req_1', tenantId: 'tenant_1' });
  });

  it('does not export a workspace that still has another live subscription', async () => {
    const db = prisma({ stripeSubscription: { count: vi.fn().mockResolvedValue(1) } });
    const enqueue = vi.fn();
    await createEndedSubscriptionExportHook(
      db,
      logger,
      enqueue
    )({
      tenantId: 'tenant_1',
      subscriptionId: 'sub_engine',
    });
    expect((db as any).workspaceExportRequest.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rethrows a database failure so the webhook is retried', async () => {
    const db = prisma({
      workspaceExportRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error('db down')),
      },
    });
    await expect(
      createEndedSubscriptionExportHook(
        db,
        logger,
        vi.fn()
      )({ tenantId: 'tenant_1', subscriptionId: 's' })
    ).rejects.toMatchObject({
      name: 'WorkspaceExportTriggerError',
      message: expect.stringContaining('db down'),
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('keeps the request when only the queue write fails', async () => {
    const db = prisma();
    await expect(
      createEndedSubscriptionExportHook(
        db,
        logger,
        vi.fn().mockRejectedValue(new Error('redis'))
      )({
        tenantId: 'tenant_1',
        subscriptionId: 'sub_1',
      })
    ).resolves.toBeUndefined();
    expect((db as any).workspaceExportRequest.create).toHaveBeenCalled();
  });
});
