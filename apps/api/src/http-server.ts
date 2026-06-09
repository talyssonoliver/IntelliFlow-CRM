import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { AnyRouter } from '@trpc/server';
import { createContext } from './context';
import { appRouter } from './router';
import {
  createCorrelationHeaders,
  initializeRequestContext,
  runWithContext,
} from './tracing/correlation';
import {
  getDatabaseStats,
  getDetailedHealth,
  getLivenessHealth,
  getPingHealth,
  getReadinessHealth,
} from './modules/misc/health.service';
import { container } from './container';
import { processStripeWebhook } from './webhooks/stripe-webhook';

export const API_PORT = Number(process.env.PORT ?? 4000);

type ApiContext = Awaited<ReturnType<typeof createContext>>;
type ApiContextFactory = (
  opts?: Parameters<typeof createContext>[0]
) => ApiContext | Promise<ApiContext>;

type ApiServerOptions = {
  port?: number;
  router?: AnyRouter;
  createContext?: ApiContextFactory;
};

function normalizePathname(pathname: string): string {
  if (pathname === '/') {
    return pathname;
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function getOrigin(req: IncomingMessage): string {
  const host = req.headers.host ?? `localhost:${API_PORT}`;
  return `http://${host}`;
}

function createHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method?.toUpperCase() ?? 'GET';
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function createWebRequest(req: IncomingMessage, origin: string, body?: Buffer): Request {
  const url = new URL(req.url ?? '/', origin);
  const method = req.method?.toUpperCase() ?? 'GET';
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: createHeaders(req),
  };

  if (body && body.length > 0 && method !== 'GET' && method !== 'HEAD') {
    init.body = body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

/**
 * Apply HTTP security headers to every API response.
 *
 * These headers protect against common web vulnerabilities:
 * - HSTS: enforce TLS for 2 years (reverts to http-only warning in dev)
 * - X-Frame-Options: prevent clickjacking — API should never be framed
 * - X-Content-Type-Options: prevent MIME sniffing
 * - X-XSS-Protection: disabled (0) — modern browsers use CSP instead
 * - Referrer-Policy: limit referrer leakage
 * - Cache-Control: prevent caching of sensitive API responses
 */
function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function applyCorrelationHeaders(res: ServerResponse): void {
  applySecurityHeaders(res);
  const headers = createCorrelationHeaders();
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  headOnly: boolean
): void {
  applyCorrelationHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');

  if (headOnly) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
}

async function writeFetchResponse(
  res: ServerResponse,
  response: Response,
  headOnly: boolean
): Promise<void> {
  applyCorrelationHeaders(res);
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (headOnly) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function sendMethodNotAllowed(res: ServerResponse, headOnly: boolean): void {
  applyCorrelationHeaders(res);
  res.statusCode = 405;
  res.setHeader('Allow', 'GET, HEAD');
  res.setHeader('Content-Type', 'application/json');

  if (headOnly) {
    res.end();
    return;
  }

  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}

function sendNotFound(res: ServerResponse, headOnly: boolean): void {
  applyCorrelationHeaders(res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');

  if (headOnly) {
    res.end();
    return;
  }

  res.end(JSON.stringify({ error: 'Not Found' }));
}

function sendInternalError(res: ServerResponse, error: unknown, headOnly: boolean): void {
  applyCorrelationHeaders(res);
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');

  if (headOnly) {
    res.end();
    return;
  }

  res.end(
    JSON.stringify({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  );
}

function toHealthStatusCode(status: 'healthy' | 'degraded'): number {
  return status === 'healthy' ? 200 : 200;
}

function toDatabaseStatsStatusCode(status: 'ok' | 'unsupported' | 'error'): number {
  return status === 'error' ? 503 : 200;
}

/** Exact pathnames served by {@link handleHealthRoute} (both bare and /api-prefixed). */
const HEALTH_PATHS = new Set<string>([
  '/health',
  '/api/health',
  '/health/live',
  '/api/health/live',
  '/health/ready',
  '/api/health/ready',
  '/health/detailed',
  '/api/health/detailed',
  '/health/db',
  '/api/health/db',
]);

async function handleHealthRoute(
  pathname: string,
  createContextFn: ApiContextFactory,
  webRequest: Request,
  res: ServerResponse,
  headOnly: boolean
): Promise<boolean> {
  // Only health *paths* are GET/HEAD-only. The method guard must NOT run for
  // unrelated pathnames — doing so 405s every non-GET request (Stripe webhook
  // POSTs, tRPC mutations) before their own handlers, downstream, can see them.
  if (!HEALTH_PATHS.has(pathname)) {
    return false;
  }

  const method = webRequest.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    sendMethodNotAllowed(res, headOnly);
    return true;
  }

  switch (pathname) {
    case '/health':
    case '/api/health':
      sendJson(res, 200, getPingHealth(), headOnly);
      return true;
    case '/health/live':
    case '/api/health/live':
      sendJson(res, 200, getLivenessHealth(), headOnly);
      return true;
    case '/health/ready':
    case '/api/health/ready': {
      const ctx = await Promise.resolve(createContextFn({ req: webRequest }));
      const readiness = await getReadinessHealth(ctx);
      sendJson(res, readiness.ready ? 200 : 503, readiness, headOnly);
      return true;
    }
    case '/health/detailed':
    case '/api/health/detailed': {
      const ctx = await Promise.resolve(createContextFn({ req: webRequest }));
      const health = await getDetailedHealth(ctx, { includeDatabaseStats: true });
      sendJson(res, toHealthStatusCode(health.status), health, headOnly);
      return true;
    }
    case '/health/db':
    case '/api/health/db': {
      const ctx = await Promise.resolve(createContextFn({ req: webRequest }));
      const dbStats = await getDatabaseStats(ctx);
      sendJson(res, toDatabaseStatsStatusCode(dbStats.status), dbStats, headOnly);
      return true;
    }
    default:
      return false;
  }
}

async function handleTrpcRoute(
  pathname: string,
  router: AnyRouter,
  createContextFn: ApiContextFactory,
  webRequest: Request,
  res: ServerResponse,
  headOnly: boolean
): Promise<boolean> {
  let endpoint: string | null = null;

  if (pathname === '/trpc' || pathname.startsWith('/trpc/')) {
    endpoint = '/trpc';
  } else if (pathname === '/api/trpc' || pathname.startsWith('/api/trpc/')) {
    endpoint = '/api/trpc';
  }

  if (!endpoint) {
    return false;
  }

  const response = await fetchRequestHandler({
    endpoint,
    req: webRequest,
    router,
    createContext: () => Promise.resolve(createContextFn({ req: webRequest })),
  });

  await writeFetchResponse(res, response, headOnly);
  return true;
}

/**
 * IFC-314 (step 3): verified raw-body Stripe webhook route. Lives on the same
 * service as tRPC; the raw bytes (needed for signature verification) are still
 * intact here, before tRPC would JSON-parse them. Fails closed when the secret
 * is unset. POST only.
 */
async function handleStripeWebhookRoute(
  pathname: string,
  req: IncomingMessage,
  body: Buffer | undefined,
  res: ServerResponse,
  headOnly: boolean
): Promise<boolean> {
  if (pathname !== '/api/webhooks/stripe' && pathname !== '/webhooks/stripe') {
    return false;
  }
  if ((req.method?.toUpperCase() ?? 'GET') !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' }, headOnly);
    return true;
  }

  const rawBody = body?.toString('utf8') ?? '';
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value[0] ?? '';
  }

  const adapters = container.get<{
    stripeSubscriptionRepository: import('@intelliflow/domain').StripeSubscriptionRepository;
    portalDeliverySync: Parameters<typeof processStripeWebhook>[2]['portalSync'];
    setupInstalmentRepository: Parameters<typeof processStripeWebhook>[2]['setupInstalments'];
  }>('adapters');
  const moduleAccess = ((): Parameters<typeof processStripeWebhook>[2]['moduleAccess'] => {
    try {
      return container.get('moduleAccess');
    } catch {
      return null;
    }
  })();

  const result = await processStripeWebhook(rawBody, headers, {
    subscriptionRepository: adapters.stripeSubscriptionRepository,
    portalSync: adapters.portalDeliverySync,
    setupInstalments: adapters.setupInstalmentRepository,
    moduleAccess,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  sendJson(
    res,
    result.statusCode,
    { success: result.success, message: result.message, eventId: result.eventId },
    headOnly
  );
  return true;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  router: AnyRouter,
  createContextFn: ApiContextFactory
): Promise<void> {
  const origin = getOrigin(req);
  const pathname = normalizePathname(new URL(req.url ?? '/', origin).pathname);
  const headOnly = (req.method?.toUpperCase() ?? 'GET') === 'HEAD';
  const body = await readRequestBody(req);
  const webRequest = createWebRequest(req, origin, body);

  if (await handleHealthRoute(pathname, createContextFn, webRequest, res, headOnly)) {
    return;
  }

  if (await handleStripeWebhookRoute(pathname, req, body, res, headOnly)) {
    return;
  }

  if (await handleTrpcRoute(pathname, router, createContextFn, webRequest, res, headOnly)) {
    return;
  }

  sendNotFound(res, headOnly);
}

export function createApiServer(options: ApiServerOptions = {}): http.Server {
  const router = options.router ?? appRouter;
  const createContextFn = options.createContext ?? createContext;

  return http.createServer((req, res) => {
    const requestContext = initializeRequestContext(req.headers);

    void runWithContext(requestContext, async () => {
      try {
        await handleRequest(req, res, router, createContextFn);
      } catch (error) {
        console.error('[API] HTTP request failed:', error);
        sendInternalError(res, error, (req.method?.toUpperCase() ?? 'GET') === 'HEAD');
      }
    });
  });
}

export function startApiServer(options: ApiServerOptions = {}): http.Server {
  const port = options.port ?? API_PORT;
  const server = createApiServer(options);

  server.listen(port, () => {
    console.log(`[API] HTTP server listening on http://localhost:${port}`);
  });

  return server;
}
