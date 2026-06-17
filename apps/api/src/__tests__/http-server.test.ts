import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import http, { type Server } from 'node:http';
import { createApiServer } from '../http-server';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { createPublicContext, prismaMock } from '../test/setup';

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * Raw HTTP request helper. `fetch`/undici silently drops the forbidden `Origin`
 * request header, so CORS preflight behaviour can only be exercised with the
 * low-level client where we control every header (including `Origin` and the
 * `Access-Control-Request-*` preflight headers).
 */
function rawRequest(
  baseUrl: string,
  opts: { method: string; path: string; headers?: Record<string, string> }
): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  const url = new URL(opts.path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method,
        headers: opts.headers,
      },
      (res) => {
        res.resume(); // drain the body so the socket can close
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function startTestServer(overrides?: {
  createContext?: (opts?: {
    req?: Request;
    res?: Response;
  }) => ReturnType<typeof createPublicContext>;
}): Promise<{ server: Server; baseUrl: string }> {
  const router = createTRPCRouter({
    hello: publicProcedure.query(() => 'world'),
  });

  const server = createApiServer({
    router,
    createContext: (opts) =>
      createPublicContext({
        req: opts?.req,
      }),
    ...overrides,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Server did not bind to a port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('HTTP API Server', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await closeServer(server);
      }
    }
  });

  it('serves /health with the shared ping response', async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/health`);
    const body = await readJson<{ status: string; timestamp: string }>(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).toBeTruthy();
    expect(body.status).toBe('healthy');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('serves /api/health/live as a compatibility alias', async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/health/live`);
    const body = await readJson<{ alive: boolean; pid: number }>(response);

    expect(response.status).toBe(200);
    expect(body.alive).toBe(true);
    expect(body.pid).toBe(process.pid);
  });

  it('does not build request context for lightweight health probes', async () => {
    const createContext = vi.fn(() => {
      throw new Error('createContext should not be called');
    });

    const { server, baseUrl } = await startTestServer({
      createContext,
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/health`);
    const body = await readJson<{ status: string }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(createContext).not.toHaveBeenCalled();
  });

  it('returns 503 for readiness when database connectivity fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('Database unavailable'));

    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await readJson<{ ready: boolean; error?: string }>(response);

    expect(response.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(body.error).toBe('Database unavailable');
  });

  it('includes database stats in the detailed health response', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const prismaWithoutMetrics = {
      ...prismaMock,
      $metrics: undefined,
    };

    const { server, baseUrl } = await startTestServer({
      createContext: (opts) =>
        createPublicContext({
          prisma: prismaWithoutMetrics as any,
          req: opts?.req,
        }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/health/detailed`);
    const body = await readJson<{
      status: string;
      checks: { database: { status: string } };
      databaseStats: { status: string };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('ok');
    expect(body.databaseStats.status).toBe('unsupported');
  });

  it('serves database metrics from /api/health/db when available', async () => {
    const metrics = { counters: [{ key: 'pool_active', value: 2 }] };
    const prismaWithMetrics = {
      ...prismaMock,
      $metrics: {
        json: vi.fn().mockResolvedValue(metrics),
      },
    } as typeof prismaMock & { $metrics: { json: () => Promise<unknown> } };

    const { server, baseUrl } = await startTestServer({
      createContext: (opts) =>
        createPublicContext({
          prisma: prismaWithMetrics as any,
          req: opts?.req,
        }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/health/db`);
    const body = await readJson<{ status: string; metrics: unknown }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.metrics).toEqual(metrics);
  });

  it('serves tRPC routes through both /trpc and /api/trpc', async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const directResponse = await fetch(`${baseUrl}/trpc/hello`);
    const directBody = await directResponse.text();
    const aliasResponse = await fetch(`${baseUrl}/api/trpc/hello`);
    const aliasBody = await aliasResponse.text();

    expect(directResponse.status).toBe(200);
    expect(directBody).toContain('world');
    expect(aliasResponse.status).toBe(200);
    expect(aliasBody).toContain('world');
  });

  // Fix #19 — Security headers are present on all responses
  describe('security headers (Fix #19)', () => {
    it('includes HSTS header on /health responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);

      expect(response.headers.get('strict-transport-security')).toBe(
        'max-age=63072000; includeSubDomains; preload'
      );
    });

    it('includes X-Frame-Options: DENY on API responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });

    it('includes X-Content-Type-Options: nosniff on API responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('includes X-XSS-Protection: 0 (modern best practice) on API responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('x-xss-protection')).toBe('0');
    });

    it('includes Referrer-Policy on API responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    it('includes Cache-Control: no-store on API responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('includes all security headers on tRPC responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/trpc/hello`);

      expect(response.headers.get('strict-transport-security')).toBe(
        'max-age=63072000; includeSubDomains; preload'
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-xss-protection')).toBe('0');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('includes security headers on 404 responses', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const response = await fetch(`${baseUrl}/nonexistent-route`);

      expect(response.status).toBe(404);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });
  });

  it('returns HTTP 200 with degraded status in the body for detailed health', async () => {
    // /health/detailed stays 200 even when degraded — degradation is reported
    // in the body (the worker convention: degraded = "still operational").
    // A merely-degraded API must NOT be pulled from rotation by load balancers.
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const { server, baseUrl } = await startTestServer({
      createContext: (opts) =>
        createPublicContext({
          prisma: prismaMock,
          req: opts?.req,
        }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/health/detailed`);
    const body = await readJson<{ status: string }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
  });

  // Regression (IFC-314): the health route's GET/HEAD-only guard must apply ONLY
  // to health paths. It previously ran before the path switch and 405'd *every*
  // non-GET request — which made the Stripe webhook POST route unreachable.
  it('does not 405 a non-GET request on a non-health path', async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const response = await fetch(`${baseUrl}/nonexistent-route`, { method: 'POST', body: '{}' });

    expect(response.status).toBe(404);
    expect(response.status).not.toBe(405);
  });

  // Regression (PERF-08/09): the web became a CROSS-ORIGIN tRPC client. Every
  // authenticated request triggers a CORS preflight (OPTIONS). Before the fix
  // the preflight fell through to a 404 and the browser blocked the real
  // request — surfacing as a phantom "not authenticated" redirect loop. None of
  // the mocked client tests caught this because they never make a real
  // cross-origin request. These exercise the real HTTP server.
  describe('CORS preflight + headers (PERF-08/09)', () => {
    const ALLOWED = 'http://localhost:3000';

    it('answers the /api/trpc preflight from an allowed origin with 204 + CORS headers', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await rawRequest(baseUrl, {
        method: 'OPTIONS',
        path: '/api/trpc/auth.getStatus',
        headers: {
          Origin: ALLOWED,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });

      // The exact regression: this preflight previously 404'd.
      expect(res.status).toBe(204);
      expect(res.status).not.toBe(404);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('authorization');
      expect(res.headers['access-control-allow-headers']).toContain('x-trpc-source');
    });

    it('omits Access-Control-Allow-Origin for a disallowed origin', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await rawRequest(baseUrl, {
        method: 'OPTIONS',
        path: '/api/trpc/auth.getStatus',
        headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
      });

      // No allow-origin header → the browser blocks the cross-origin call.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('echoes Access-Control-Allow-Origin on the actual tRPC response', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await rawRequest(baseUrl, {
        method: 'GET',
        path: '/api/trpc/hello',
        headers: { Origin: ALLOWED },
      });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      // Security headers must still be present alongside CORS.
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('echoes Access-Control-Allow-Origin on health responses for allowed origins', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await rawRequest(baseUrl, {
        method: 'GET',
        path: '/api/health',
        headers: { Origin: ALLOWED },
      });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    });

    it('sets no CORS header for same-origin / server-to-server calls (no Origin)', async () => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await rawRequest(baseUrl, { method: 'GET', path: '/api/health' });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
