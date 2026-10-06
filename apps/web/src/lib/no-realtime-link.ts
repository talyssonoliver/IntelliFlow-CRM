/**
 * tRPC link for environments without a WebSocket endpoint.
 *
 * When NEXT_PUBLIC_WS_URL is not configured (a production build without the WS
 * service, or the E2E environment), app/providers.tsx falls back to HTTP-only
 * links. httpBatchLink rejects subscription operations ("Subscriptions are
 * unsupported by `httpLink`"), and that error surfaced as a render crash: every
 * page that mounts a live-update hook (notifications.onNew, subscriptions.*)
 * fell into the error boundary. Routing subscriptions here instead completes
 * them without data, so those pages render normally and simply get no live
 * updates — the "HTTP-only fallback" the providers comment always described.
 */

import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@intelliflow/api-client';

let warned = false;

export const noRealtimeLink: TRPCLink<AppRouter> = () => () =>
  observable((observer) => {
    if (!warned) {
      warned = true;
      console.info('[tRPC] Real-time updates are off: no WebSocket endpoint is configured.');
    }
    observer.complete();
    return () => {};
  });
