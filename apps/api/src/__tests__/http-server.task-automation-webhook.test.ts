/**
 * PG-208: the task-automation webhook route is mounted on the real HTTP server,
 * before CORS and the global body read, with a bounded read and a method guard.
 * Signature logic is unit-tested in task-automation-webhook.test.ts.
 */
import { randomBytes } from 'node:crypto';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTaskAutomationStore } from '../modules/task/automation/__tests__/fake-task-automation-store';
import {
  WebhookFailureLimiter,
  sha256Hex,
  signWebhookPayload,
  type WebhookRouteDeps,
} from '../modules/task/automation/task-automation-webhook';

const holder = vi.hoisted(() => ({ deps: null as unknown as WebhookRouteDeps }));

vi.mock('../modules/task/automation/task-automation-runtime', () => ({
  getTaskAutomationWebhookDeps: async () => holder.deps,
  createTaskAutomationRuntime: vi.fn(),
}));

import { createApiServer } from '../http-server';
import { createTRPCRouter, publicProcedure } from '../trpc';

let server: Server;
let baseUrl: string;
let store: FakeTaskAutomationStore;
let token: string;
let secret: string;

async function start(): Promise<void> {
  server = createApiServer({
    router: createTRPCRouter({ hello: publicProcedure.query(() => 'world') }),
    createContext: () => ({}) as never,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  store = new FakeTaskAutomationStore(() => new Date());
  token = 'tat_' + randomBytes(32).toString('base64url');
  secret = randomBytes(32).toString('hex');
  store.rule({
    tenantId: 'tenant-a',
    triggerType: 'WEBHOOK',
    eventType: null,
    webhookTokenHash: sha256Hex(token),
    webhookSecret: secret,
    actions: [],
  });
  holder.deps = {
    store,
    limiter: new WebhookFailureLimiter(),
    now: () => new Date(),
    encryptionReady: () => true,
    log: { warn: vi.fn() },
  };
  await start();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function headersFor(raw: string, key = 'evt-1'): Record<string, string> {
  const t = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
    'x-intelliflow-signature': `t=${t},v1=${signWebhookPayload(secret, t, key, Buffer.from(raw))}`,
    'idempotency-key': key,
  };
}

describe('task-automation webhook route (PG-208)', () => {
  it('accepts a signed POST on both mount paths with no CORS headers', async () => {
    const raw = JSON.stringify({ orderId: 'A-1' });
    for (const [i, prefix] of [
      '/api/webhooks/task-automation/',
      '/webhooks/task-automation/',
    ].entries()) {
      const res = await fetch(baseUrl + prefix + token, {
        method: 'POST',
        headers: headersFor(raw, `evt-${i}`),
        body: raw,
      });
      expect(res.status).toBe(202);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      await expect(res.json()).resolves.toEqual({ accepted: true, duplicate: false });
    }
    expect(store.runs).toHaveLength(2);
  });

  it('answers GET with 405 and Allow: POST', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('does not answer a CORS preflight for the webhook path', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a declared body over 64 KB with 413 and Connection: close', async () => {
    const raw = 'x'.repeat(65_537);
    const res = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`, {
      method: 'POST',
      headers: headersFor(raw),
      body: raw,
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('connection')).toBe('close');
    expect(store.runs).toHaveLength(0);
  });

  it('counts oversized bodies against the IP limiter', async () => {
    holder.deps.limiter = new WebhookFailureLimiter(1);
    const raw = 'x'.repeat(65_537);
    const first = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`, {
      method: 'POST',
      headers: headersFor(raw),
      body: raw,
    });
    expect(first.status).toBe(413);
    const small = '{}';
    const second = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`, {
      method: 'POST',
      headers: headersFor(small),
      body: small,
    });
    expect(second.status).toBe(429);
  });

  it('stops reading a streamed (chunked) body past 64 KB', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(`${baseUrl}/api/webhooks/task-automation/${token}`, {
        method: 'POST',
        headers: { 'transfer-encoding': 'chunked', 'content-type': 'application/json' },
      });
      req.on('response', (res) => resolve(res.statusCode ?? 0));
      req.on('error', (err) =>
        /(ECONNRESET|EPIPE)/.test(String(err)) ? resolve(-1) : reject(err)
      );
      const chunk = 'y'.repeat(16_384);
      let sent = 0;
      const pump = () => {
        while (sent < 20) {
          sent++;
          if (!req.write(chunk)) {
            req.once('drain', pump);
            return;
          }
        }
        req.end();
      };
      pump();
    });
    expect([413, -1]).toContain(status);
    expect(store.runs).toHaveLength(0);
  });

  it('blocks an IP after repeated failures and returns the identical 404 for bad tokens', async () => {
    holder.deps.limiter = new WebhookFailureLimiter(2);
    const raw = '{}';
    const bad = `${baseUrl}/api/webhooks/task-automation/tat_${'x'.repeat(43)}`;
    const first = await fetch(bad, { method: 'POST', headers: headersFor(raw), body: raw });
    const second = await fetch(`${baseUrl}/api/webhooks/task-automation/garbage`, {
      method: 'POST',
      headers: headersFor(raw),
      body: raw,
    });
    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(await first.text()).toBe(await second.text());
    const third = await fetch(bad, { method: 'POST', headers: headersFor(raw), body: raw });
    expect(third.status).toBe(429);
  });

  it('returns a generic 500 when the handler throws, without the error message', async () => {
    vi.spyOn(store, 'loadWebhookRule').mockRejectedValueOnce(new Error('connection string leaked'));
    const raw = '{}';
    const res = await fetch(`${baseUrl}/api/webhooks/task-automation/${token}`, {
      method: 'POST',
      headers: headersFor(raw),
      body: raw,
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"internal"}');
    expect(holder.deps.log!.warn).toHaveBeenCalledWith('[task-automation] webhook failed: Error');
  });

  it('leaves other routes untouched', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/somewhere-else`, {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
