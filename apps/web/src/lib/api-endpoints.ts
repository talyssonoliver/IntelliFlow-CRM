/**
 * Where the tRPC client sends requests (app/providers.tsx), kept out of providers.tsx so it can
 * be tested: providers' tests asserted a copy of getWsUrl whose production branch returned
 * `wss://<host>/ws`, the opposite of this code (#1216).
 */
import { requiredProdEnv } from '@/lib/required-url';

/** The HTTP base URL: the API URL in the browser, the app's own URL on the server. */
export function getBaseUrl() {
  if (typeof globalThis.window !== 'undefined') return process.env.NEXT_PUBLIC_API_URL ?? '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return requiredProdEnv(
    'NEXT_PUBLIC_APP_URL',
    process.env.NEXT_PUBLIC_APP_URL,
    `http://localhost:${process.env.PORT ?? 3000}`
  );
}

/** The WebSocket URL for subscriptions, or null when there is none (server, or not configured). */
export function getWsUrl() {
  if (typeof globalThis.window === 'undefined') return null;

  // Production: rely on NEXT_PUBLIC_WS_URL pointing at the deployed WS server
  // (Railway runs apps/api/src/ws-server.ts as its own service). When the env
  // var is absent we return null so getWsClient() short-circuits and the
  // tRPC providers fall back to HTTP-only links — no Connection-closed
  // exception breaks React hydration on environments without a WS endpoint.
  if (process.env.NODE_ENV === 'production') {
    const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
    return configured && configured.length > 0 ? configured : null;
  }

  // Dev fallback: tsx-watched ws-server.ts on localhost.
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? '3001';
  return `${protocol}//localhost:${wsPort}`;
}
