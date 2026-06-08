import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiServer } from '../http-server';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { createPublicContext, prismaMock } from '../test/setup';

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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
});
