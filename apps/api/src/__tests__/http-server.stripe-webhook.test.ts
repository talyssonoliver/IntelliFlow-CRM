import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// IFC-314 (step 3): exercise the verified raw-body Stripe webhook route wired into
// the HTTP server (`handleStripeWebhookRoute`). The route is internal, so we drive
// it end-to-end through `createApiServer` over a real socket and stub its two
// collaborators — the DI container and `processStripeWebhook` — so the test stays
// a unit of the *routing/glue*, not of signature verification (covered elsewhere).
const { containerGet, processStripeWebhookMock, readyControl } = vi.hoisted(() => ({
  containerGet: vi.fn(),
  processStripeWebhookMock: vi.fn(),
  // Controllable stand-in for the lazily-resolved `containerReady` promise so a
  // test can simulate a still-initialising container.
  readyControl: { promise: Promise.resolve() as Promise<void> },
}));

vi.mock('../container', () => ({
  container: { get: containerGet },
  get containerReady() {
    return readyControl.promise;
  },
}));

vi.mock('../webhooks/stripe-webhook', () => ({
  processStripeWebhook: processStripeWebhookMock,
}));

import { createApiServer } from '../http-server';
import { createTRPCRouter, publicProcedure } from '../trpc';

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  // A minimal router + context so we never touch the real appRouter/container for
  // the tRPC path (the webhook route resolves before tRPC anyway).
  const router = createTRPCRouter({
    hello: publicProcedure.query(() => 'world'),
  });

  const server = createApiServer({
    router,
    createContext: () => ({}) as never,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('Server did not bind to a port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

const adapters = {
  stripeSubscriptionRepository: { __brand: 'repo' },
  portalDeliverySync: { __brand: 'portalSync' },
};

describe('HTTP Stripe webhook route (IFC-314)', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    containerGet.mockReset();
    processStripeWebhookMock.mockReset();
    readyControl.promise = Promise.resolve();
  });

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    }
  });

  it('rejects a non-POST method with 405 and never reaches the handler', async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/webhooks/stripe`, { method: 'GET' });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(405);
    expect(body.error).toBe('method_not_allowed');
    expect(processStripeWebhookMock).not.toHaveBeenCalled();
    expect(containerGet).not.toHaveBeenCalled();
  });

  it('POSTs a verified webhook through to processStripeWebhook and relays its result', async () => {
    const moduleAccess = { syncModulesToPlan: vi.fn() };
    containerGet.mockImplementation((key: string) => {
      if (key === 'adapters') return adapters;
      if (key === 'moduleAccess') return moduleAccess;
      throw new Error(`unexpected container key: ${key}`);
    });
    processStripeWebhookMock.mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'processed',
      eventId: 'evt_123',
    });

    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test', 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_123', type: 'customer.subscription.updated' }),
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      eventId: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.eventId).toBe('evt_123');

    expect(processStripeWebhookMock).toHaveBeenCalledTimes(1);
    const [rawBody, headers, deps] = processStripeWebhookMock.mock.calls[0] as [
      string,
      Record<string, string>,
      {
        subscriptionRepository: unknown;
        portalSync: unknown;
        moduleAccess: unknown;
        webhookSecret: string | undefined;
      },
    ];
    // Raw bytes are forwarded intact (needed for signature verification), and the
    // request headers are normalised to a flat string map (lower-cased keys).
    expect(rawBody).toContain('evt_123');
    expect(headers['stripe-signature']).toBe('sig_test');
    expect(deps.subscriptionRepository).toBe(adapters.stripeSubscriptionRepository);
    expect(deps.portalSync).toBe(adapters.portalDeliverySync);
    expect(deps.moduleAccess).toBe(moduleAccess);
    expect(deps.webhookSecret).toBe(process.env.STRIPE_WEBHOOK_SECRET);
  });

  it('falls back to a null moduleAccess when the container has none bound', async () => {
    containerGet.mockImplementation((key: string) => {
      if (key === 'adapters') return adapters;
      throw new Error('moduleAccess not registered');
    });
    processStripeWebhookMock.mockResolvedValue({
      success: false,
      statusCode: 400,
      message: 'invalid signature',
    });

    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': 'bad' },
      body: '{}',
    });
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    const lastCall = processStripeWebhookMock.mock.calls.at(-1) as [
      string,
      Record<string, string>,
      { moduleAccess: unknown },
    ];
    expect(lastCall[2].moduleAccess).toBeNull();
  });

  it('serves the un-prefixed /webhooks/stripe alias as well', async () => {
    containerGet.mockImplementation((key: string) => {
      if (key === 'adapters') return adapters;
      return null;
    });
    processStripeWebhookMock.mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'ok',
      eventId: 'evt_alias',
    });

    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_alias' }),
    });

    expect(response.status).toBe(200);
    expect(processStripeWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('awaits containerReady before touching the container during a cold init', async () => {
    // Simulate the container still initialising: containerReady stays pending.
    let resolveReady!: () => void;
    readyControl.promise = new Promise<void>((r) => {
      resolveReady = r;
    });
    containerGet.mockImplementation((key: string) => (key === 'adapters' ? adapters : null));
    processStripeWebhookMock.mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'ok',
      eventId: 'evt_cold',
    });

    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const responsePromise = fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_cold' }),
    });

    // While the container is still resolving, the handler must NOT have read the
    // container Proxy (which would throw mid-init) nor invoked the processor.
    await new Promise((r) => setTimeout(r, 50));
    expect(containerGet).not.toHaveBeenCalled();
    expect(processStripeWebhookMock).not.toHaveBeenCalled();

    // Container finishes initialising → the request proceeds normally.
    resolveReady();
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(containerGet).toHaveBeenCalledWith('adapters');
  });
});
