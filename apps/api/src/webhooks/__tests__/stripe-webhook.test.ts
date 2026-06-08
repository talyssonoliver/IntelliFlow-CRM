import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  processStripeWebhook,
  buildStripeWebhookHandler,
  type StripeWebhookDeps,
} from '../stripe-webhook';

const SECRET = 'whsec_test_123';

function stripeSignature(rawBody: string, secret = SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function subscriptionEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        current_period_end: 1_780_000_000,
        cancel_at_period_end: false,
        metadata: { tenantId: 'tenant_1', tenantSlug: 'acme' },
        items: { data: [{ price: { metadata: { planTier: 'professional' } } }] },
        ...overrides,
      },
    },
  });
}

function makeDeps(overrides: Partial<StripeWebhookDeps> = {}) {
  const upsertFromWebhook = vi.fn().mockResolvedValue(undefined);
  const pushDelivery = vi.fn().mockResolvedValue({ isFailure: false });
  const syncModulesToPlan = vi.fn().mockResolvedValue([]);
  const deps = {
    subscriptionRepository: { upsertFromWebhook } as any,
    portalSync: { pushDelivery } as any,
    moduleAccess: { syncModulesToPlan } as any,
    webhookSecret: SECRET,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return { deps, upsertFromWebhook, pushDelivery, syncModulesToPlan };
}

describe('processStripeWebhook', () => {
  let h: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    h = makeDeps();
  });

  it('verifies the signature and processes a subscription event', async () => {
    const body = subscriptionEvent();
    const res = await processStripeWebhook(
      body,
      { 'stripe-signature': stripeSignature(body) },
      h.deps
    );

    expect(res.statusCode).toBe(200);
    expect(res.success).toBe(true);
    expect(h.upsertFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: 'sub_1',
        status: 'ACTIVE',
        tenantSlug: 'acme',
      })
    );
    expect(h.pushDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'acme', subscriptionStatus: 'active' })
    );
    // plan change → module sync (planTier uppercased)
    expect(h.syncModulesToPlan).toHaveBeenCalledWith('tenant_1', 'PROFESSIONAL');
  });

  it('rejects an invalid signature with 401 and does NOT process', async () => {
    const body = subscriptionEvent();
    const res = await processStripeWebhook(body, { 'stripe-signature': 't=1,v1=deadbeef' }, h.deps);
    expect(res.statusCode).toBe(401);
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 401', async () => {
    const body = subscriptionEvent();
    const res = await processStripeWebhook(body, {}, h.deps);
    expect(res.statusCode).toBe(401);
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
  });

  it('fails CLOSED (503) when the webhook secret is unset', async () => {
    const body = subscriptionEvent();
    const { webhookSecret: _omit, ...rest } = h.deps;
    const res = await processStripeWebhook(
      body,
      { 'stripe-signature': stripeSignature(body) },
      { ...rest, webhookSecret: undefined }
    );
    expect(res.statusCode).toBe(503);
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
  });

  it('ignores a non-subscription event type (allowed-events filter, 200)', async () => {
    const body = JSON.stringify({
      id: 'evt_2',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const res = await processStripeWebhook(
      body,
      { 'stripe-signature': stripeSignature(body) },
      h.deps
    );
    expect(res.statusCode).toBe(200);
    expect(h.upsertFromWebhook).not.toHaveBeenCalled();
  });

  it('dedupes a replayed event id (processes once)', async () => {
    const body = subscriptionEvent();
    const sig = stripeSignature(body);
    // Same handler instance across both calls so the event log persists.
    const handler = buildStripeWebhookHandler(h.deps);
    const first = await handler.handleRequest('stripe', body, { 'stripe-signature': sig });
    const second = await handler.handleRequest('stripe', body, { 'stripe-signature': sig });
    expect(first.statusCode).toBe(200);
    expect(second.message).toMatch(/duplicate/i);
    expect(h.upsertFromWebhook).toHaveBeenCalledTimes(1);
  });

  it('does not require moduleAccess (parity sync is optional)', async () => {
    const deps = { ...h.deps, moduleAccess: null };
    const body = subscriptionEvent();
    const res = await processStripeWebhook(
      body,
      { 'stripe-signature': stripeSignature(body) },
      deps
    );
    expect(res.statusCode).toBe(200);
    expect(h.upsertFromWebhook).toHaveBeenCalled();
  });
});
