import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// CRM-PR-A: exercise the PM-event receiver route wired into the HTTP server
// (the handlePmEventsRoute dispatch block in http-server.ts), end-to-end through
// createApiServer over a real socket. The route handler + DI container + stripe
// collaborator are stubbed so this is a unit of the *routing/glue* only (the
// handler itself is covered by the pm-events module tests).
const { containerGet, handlePmEventsRouteMock } = vi.hoisted(() => ({
  containerGet: vi.fn(),
  handlePmEventsRouteMock: vi.fn(),
}));

vi.mock('../container', () => ({ container: { get: containerGet } }));
vi.mock('../webhooks/stripe-webhook', () => ({ processStripeWebhook: vi.fn() }));
vi.mock('../modules/pm-events/handle-pm-events-route', () => ({
  handlePmEventsRoute: handlePmEventsRouteMock,
}));

import { createApiServer } from '../http-server';
import { createTRPCRouter, publicProcedure } from '../trpc';

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const router = createTRPCRouter({ hello: publicProcedure.query(() => 'world') });
  const server = createApiServer({ router, createContext: () => ({}) as never });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('Server did not bind to a port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('HTTP PM-event receiver route (CRM-PR-A)', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    handlePmEventsRouteMock.mockReset();
    containerGet.mockReset();
  });

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        );
      }
    }
  });

  it('relays a matched route result via sendJson', async () => {
    handlePmEventsRouteMock.mockResolvedValue({
      statusCode: 202,
      body: { accepted: true, duplicate: false },
    });
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const res = await fetch(`${baseUrl}/api/internal/pm/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer x',
        'idempotency-key': 'k',
      },
      body: '{}',
    });
    const body = (await res.json()) as { accepted: boolean; duplicate: boolean };

    expect(res.status).toBe(202);
    expect(body).toEqual({ accepted: true, duplicate: false });
    expect(handlePmEventsRouteMock).toHaveBeenCalledTimes(1);
    // pathname, method, headers, rawBody
    expect(handlePmEventsRouteMock.mock.calls[0][0]).toBe('/api/internal/pm/events');
    expect(handlePmEventsRouteMock.mock.calls[0][1]).toBe('POST');
    expect(handlePmEventsRouteMock.mock.calls[0][3]).toBe('{}');
  });

  it('falls through (404) when the route handler returns null', async () => {
    handlePmEventsRouteMock.mockResolvedValue(null);
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const res = await fetch(`${baseUrl}/api/internal/pm/events`, { method: 'POST', body: '{}' });

    expect(res.status).toBe(404);
    expect(handlePmEventsRouteMock).toHaveBeenCalledTimes(1);
  });
});
