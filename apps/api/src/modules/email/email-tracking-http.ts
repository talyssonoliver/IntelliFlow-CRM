/**
 * Glue between the API's HTTP server and the tracking route (register row 41): answers `true` when the request
 * was a tracking address and has been handled. The database client is loaded on the first hit, like the
 * task-automation webhook, so an idle server stays idle.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createTrackingStore,
  handleEmailTrackingRoute,
  matchTrackingPath,
  type TrackingStore,
} from './email-tracking-route';

let store: TrackingStore | undefined;

async function trackingStore(): Promise<TrackingStore> {
  if (store) return store;
  const { prisma } = await import('@intelliflow/db');
  store = createTrackingStore(prisma as unknown as Parameters<typeof createTrackingStore>[0]);
  return store;
}

export async function handleEmailTracking(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  origin: string
): Promise<boolean> {
  const match = matchTrackingPath(pathname);
  if (!match) return false;
  const search = new URL(req.url ?? '/', origin).searchParams;
  await handleEmailTrackingRoute(req, res, match, search, await trackingStore());
  return true;
}
