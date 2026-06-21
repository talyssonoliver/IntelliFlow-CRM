/**
 * Raw-HTTP route for the PM-event receiver (CRM-PR-A). Mirrors the Stripe webhook
 * route in http-server.ts: a plain-JSON POST verified by the shared
 * PORTAL_INTERNAL_SECRET bearer + the deterministic Idempotency-Key, dispatched to the
 * pure `processPmEvent` handler with the Prisma-backed ledger. Returns the
 * {statusCode, body} for http-server to `sendJson`, or `null` if the path doesn't match.
 *
 * Mount in http-server.ts `handleRequest`, before the tRPC route:
 *   const pmRes = await handlePmEventsRoute(pathname, req.method, req.headers, body?.toString('utf8') ?? '');
 *   if (pmRes) { sendJson(res, pmRes.statusCode, pmRes.body, headOnly); return; }
 */
import { apiPrisma } from '../../container';
import { processPmEvent } from './process-pm-event';
import { PrismaInboundPmEventStore } from './prisma-inbound-store';
import type { InboundPmEventStore } from './inbound-store';

const PM_EVENTS_PATHS = new Set(['/api/internal/pm/events', '/internal/pm/events']);

let store: InboundPmEventStore | undefined;
function getStore(): InboundPmEventStore {
  return (store ??= new PrismaInboundPmEventStore(apiPrisma));
}

function header(headers: NodeJS.Dict<string | string[]>, name: string): string | null {
  const v = headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export interface PmRouteResult {
  statusCode: number;
  body: unknown;
}

export async function handlePmEventsRoute(
  pathname: string,
  method: string | undefined,
  headers: NodeJS.Dict<string | string[]>,
  rawBody: string
): Promise<PmRouteResult | null> {
  if (!PM_EVENTS_PATHS.has(pathname)) return null;
  if ((method?.toUpperCase() ?? 'GET') !== 'POST') {
    return { statusCode: 405, body: { error: 'method_not_allowed' } };
  }

  const result = await processPmEvent({
    authorizationHeader: header(headers, 'authorization'),
    idempotencyKey: header(headers, 'idempotency-key'),
    rawBody,
    store: getStore(),
    secret: process.env.PORTAL_INTERNAL_SECRET,
  });

  return { statusCode: result.statusCode, body: result.body };
}
