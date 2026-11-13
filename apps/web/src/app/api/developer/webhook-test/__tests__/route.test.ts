// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedCaller = vi.fn();
vi.mock('@/lib/route-access', () => ({
  getVerifiedCaller: (...args: unknown[]) => getVerifiedCaller(...args),
}));

const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({
  lookup,
  default: { lookup },
}));

import { POST } from '../route';

let server: http.Server;
let port = 0;
let received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
let userCounter = 0;

const PUBLIC_ADDRESS = '93.184.216.34';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      if (req.url === '/big') {
        res.end('x'.repeat(200_000));
        return;
      }
      if (req.url === '/drip') {
        // One byte at a time, never idle long enough for a socket timeout.
        res.writeHead(200);
        const timer = setInterval(() => res.write('x'), 300);
        res.on('close', () => clearInterval(timer));
        return;
      }
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://localhost/' });
        res.end();
        return;
      }
      res.setHeader('x-reply', 'yes');
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const send = (body: unknown) =>
  POST(
    new Request('http://localhost/api/developer/webhook-test', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

/** Passes the first DNS vetting, then answers with the local test server at connect time. */
const resolvesPublicThenLocal = () => {
  lookup
    .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
    .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
};

beforeEach(() => {
  received = [];
  lookup.mockReset();
  getVerifiedCaller.mockReset();
  userCounter += 1;
  getVerifiedCaller.mockResolvedValue({
    id: `user-${userCounter}`,
    email: 'a@example.invalid',
    emailConfirmed: true,
  });
});

describe('POST /api/developer/webhook-test', () => {
  it('refuses a caller who is not signed in, and sends nothing', async () => {
    getVerifiedCaller.mockResolvedValue(null);
    const response = await send({ url: 'https://example.invalid/hook', payload: {} });
    expect(response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('limits one user to 20 calls a minute', async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await send({ payload: {} })).status;
    }
    expect(last).toBe(429);
  });

  it.each([
    ['a body that is not JSON', 'not json', 'Invalid request body'],
    ['no URL', { payload: {} }, 'URL is required'],
    ['a malformed URL', { url: 'nope', payload: {} }, 'Invalid URL'],
    ['another protocol', { url: 'ftp://example.invalid/', payload: {} }, 'Only http(s)'],
    ['localhost', { url: 'http://localhost/', payload: {} }, 'Host is not allowed'],
    ['a .internal host', { url: 'http://db.internal/', payload: {} }, 'Host is not allowed'],
  ])('refuses %s', async (_name, body, message) => {
    const response = await send(body);
    expect(response.status).toBe(400);
    expect((await response.json()).body).toContain(message);
  });

  it('refuses a name that can not be resolved, or has no addresses', async () => {
    lookup.mockRejectedValueOnce(new Error('nope'));
    expect((await (await send({ url: 'http://a.example.invalid/' })).json()).body).toContain(
      'could not be resolved'
    );
    lookup.mockResolvedValueOnce([]);
    expect((await (await send({ url: 'http://a.example.invalid/' })).json()).body).toContain(
      'not allowed'
    );
  });

  it.each([
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '64:ff9b::a00:1',
    'fc00::1',
    'fe80::1',
    'not-an-ip',
  ])('refuses a name resolving to %s', async (address) => {
    lookup.mockResolvedValueOnce([{ address, family: address.includes(':') ? 6 : 4 }]);
    const response = await send({ url: 'http://a.example.invalid/', payload: {} });
    expect(response.status).toBe(400);
    expect((await response.json()).body).toContain('non-public');
  });

  it('refuses when any one of several addresses is blocked', async () => {
    lookup.mockResolvedValueOnce([
      { address: PUBLIC_ADDRESS, family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    const response = await send({ url: 'http://a.example.invalid/', payload: {} });
    expect(response.status).toBe(400);
  });

  it('never connects when the answer changes to a blocked address after the first check', async () => {
    resolvesPublicThenLocal();
    const response = await send({ url: `http://a.example.invalid:${port}/`, payload: {} });
    expect(response.status).toBe(502);
    expect((await response.json()).body).toContain('non-public');
    expect(received).toHaveLength(0);
  });

  it('refuses an oversized payload', async () => {
    lookup.mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }]);
    const response = await send({
      url: 'http://a.example.invalid/',
      payload: 'x'.repeat(300_000),
    });
    expect(response.status).toBe(413);
  });
});

/**
 * The local test server is on a blocked address by design, so these pass vetting by
 * answering with a public address and then let the socket use the real local one.
 */
describe('sending to an allowed host', () => {
  const allowLocalConnect = () => {
    lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
    const original = http.request;
    return vi.spyOn(http, 'request').mockImplementation(((
      url: URL,
      options: http.RequestOptions,
      callback: (res: http.IncomingMessage) => void
    ) => {
      expect(typeof options.lookup).toBe('function');
      const local = new URL(url);
      local.hostname = '127.0.0.1';
      return original(local, { ...options, lookup: undefined }, callback);
    }) as never);
  };

  it('returns the status, body and headers, and drops forbidden headers', async () => {
    const spy = allowLocalConnect();
    const response = await send({
      url: `http://a.example.invalid:${port}/`,
      payload: { hello: 'world' },
      headers: {
        'X-Custom': 'kept',
        Host: 'evil.example.invalid',
        'Content-Length': '1',
        'Accept-Encoding': 'gzip',
      },
    });
    spy.mockRestore();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe(200);
    expect(body.body).toBe('ok');
    expect(body.responseHeaders['x-reply']).toBe('yes');
    expect(received[0]?.body).toBe('{"hello":"world"}');
    expect(received[0]?.headers['x-custom']).toBe('kept');
    expect(received[0]?.headers.host).not.toContain('evil');
    // Only plain responses are asked for, whatever the caller sent.
    expect(received[0]?.headers['accept-encoding']).toBe('identity');
  });

  it('cuts a large response at the limit', async () => {
    const spy = allowLocalConnect();
    const response = await send({ url: `http://a.example.invalid:${port}/big`, payload: {} });
    spy.mockRestore();
    expect((await response.json()).body.length).toBe(64 * 1024);
  });

  it('stops a response that keeps trickling in after the 10 second deadline', async () => {
    const spy = allowLocalConnect();
    const started = Date.now();
    const response = await send({ url: `http://a.example.invalid:${port}/drip`, payload: {} });
    spy.mockRestore();
    const elapsed = Date.now() - started;
    expect(response.status).toBe(502);
    expect((await response.json()).body).toBe('Request timed out');
    expect(elapsed).toBeGreaterThanOrEqual(9_500);
    expect(elapsed).toBeLessThan(13_000);
  }, 20_000);

  it('does not follow a redirect', async () => {
    const spy = allowLocalConnect();
    const response = await send({ url: `http://a.example.invalid:${port}/redirect`, payload: {} });
    spy.mockRestore();
    expect((await response.json()).status).toBe(302);
    expect(received).toHaveLength(1);
  });
});
