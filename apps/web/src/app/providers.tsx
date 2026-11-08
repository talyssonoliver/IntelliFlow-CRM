'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { httpBatchLink, splitLink, createWSClient, wsLink } from '@trpc/client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { AuthProvider } from '@/lib/auth';
import { TimezoneProvider } from '@/providers/TimezoneProvider';
import { RemindersProvider } from '@/lib/cases/reminders-context';
import { AUTH_TOKEN_CHANGED_EVENT, clearTokenCookie } from '@/lib/shared/session-cleanup';
import { getValidAccessToken } from '@/lib/auth/access-token';
import { getBaseUrl, getWsUrl } from '@/lib/api-endpoints';
import { isAuthError, MUTATION_RETRY, shouldRetryQuery } from '@/lib/query-retry';
import { noRealtimeLink } from '@/lib/no-realtime-link';
import {
  ACTIVE_TENANT_HEADER,
  activeTenantHeaders,
  clearActiveTenant,
  getActiveTenantId,
  isNotAMemberError,
} from '@/lib/tenant/active-tenant';
// NOTE: We use a custom tRPC setup instead of TRPCProvider from @intelliflow/api-client
// because we need:
// - WebSocket support for real-time subscriptions
// - Custom auth error handling with automatic redirect
// - Token validation before including in headers

/**
 * ADR-053: a per-request correlation id forwarded as `x-request-id`. The API
 * tracing middleware adopts it (and the query-budget events correlate on it).
 * Falls back to a random token if `crypto.randomUUID` is unavailable.
 */
function generateRequestId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through */
  }
  return `req-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Singleton WebSocket client (created once per browser session)
let wsClient: ReturnType<typeof createWSClient> | null = null;

function closeWsClientConnection() {
  if (!wsClient) return;

  void wsClient.close().catch((error) => {
    console.warn('[tRPC WS] Failed to close client cleanly:', error);
  });
}

function disposeWsClient() {
  const client = wsClient;
  wsClient = null;

  if (!client) return;

  void client.close().catch((error) => {
    console.warn('[tRPC WS] Failed to dispose client cleanly:', error);
  });
}

function getWsClient() {
  if (typeof globalThis.window === 'undefined') return null;

  if (!wsClient) {
    const wsUrl = getWsUrl();
    if (wsUrl) {
      wsClient = createWSClient({
        url: wsUrl,
        lazy: {
          enabled: true,
          closeMs: 30_000,
        },
        connectionParams: () => {
          // Only include Authorization if token is valid (not expired)
          const accessToken = getValidAccessToken();
          // ADR-071: the active tenant travels with the connection (the WS server reads it from
          // the connection params, as it does `authorization`). A selection change reloads the
          // page, which opens a fresh connection.
          return {
            authorization: accessToken ? `Bearer ${accessToken}` : undefined,
            [ACTIVE_TENANT_HEADER]: getActiveTenantId() ?? undefined,
          };
        },
        onOpen: () => {
          console.log('[tRPC WS] Connected to WebSocket server');
        },
        onClose: () => {
          console.log('[tRPC WS] Disconnected from WebSocket server');
        },
      });
    }
  }

  return wsClient;
}

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  // Track if we've already triggered a redirect to prevent multiple redirects
  const isRedirectingRef = useRef(false);

  /**
   * Handle global auth errors - redirect to login once
   * This prevents 401 console spam and provides a single point of auth handling
   */
  const handleAuthError = useCallback(() => {
    if (isRedirectingRef.current) return;
    if (typeof globalThis.window === 'undefined') return;

    // Check if we're already on the login page
    if (globalThis.location.pathname === '/login') return;

    console.log('[QueryClient] Auth error detected, redirecting to login...');
    isRedirectingRef.current = true;

    // Clear invalid token
    localStorage.removeItem('accessToken');
    clearTokenCookie();
    // ADR-071: and the active-tenant selection that went with it (an ended pinned session, a
    // revoked membership). Signing in again must start from the home tenant.
    clearActiveTenant();

    // Redirect to login
    globalThis.location.href = '/login';
  }, []);

  /**
   * ADR-071: a stored active-tenant selection the API no longer accepts (membership revoked or
   * expired) must not wedge the whole app. Drop it and reload into the home tenant. Clearing
   * first makes this a one-shot: with no selection stored the next request cannot fail the same
   * way, so there is no reload loop.
   */
  const handleStaleTenantSelection = useCallback((error: unknown) => {
    if (typeof globalThis.window === 'undefined') return;
    if (!isNotAMemberError(error) || !getActiveTenantId()) return;

    console.warn('[Tenant] Active tenant no longer accepted, returning to the home tenant');
    clearActiveTenant();
    globalThis.location.reload();
  }, []);

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;

    const handleTokenChanged = () => {
      console.log('[tRPC WS] Auth token changed, closing active WebSocket connection');
      closeWsClientConnection();
    };

    globalThis.addEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);

    return () => {
      globalThis.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);
      disposeWsClient();
    };
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000, // React Query v5 uses gcTime (v4 used cacheTime)
            // Don't retry on auth errors - they won't succeed without re-authentication
            retry: shouldRetryQuery,
          },
          mutations: {
            // Never auto-retried (not idempotent) — see lib/query-retry.ts
            retry: MUTATION_RETRY,
          },
        },
        // Global query cache error handler
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Skip auth status query - it's expected to fail when not authenticated
            const queryKey = query.queryKey as unknown[];
            const isAuthStatusQuery =
              Array.isArray(queryKey) &&
              queryKey.some(
                (k) => Array.isArray(k) && k.includes('auth') && k.includes('getStatus')
              );

            if (isAuthError(error) && !isAuthStatusQuery) {
              handleAuthError();
            }
            handleStaleTenantSelection(error);
          },
        }),
        // Global mutation cache error handler
        mutationCache: new MutationCache({
          onError: (error) => {
            if (isAuthError(error)) {
              handleAuthError();
            }
            handleStaleTenantSelection(error);
          },
        }),
      })
  );

  const [trpcClient] = useState(() => {
    // Build links array based on environment
    const links = [];

    // Check if we're in browser and can use WebSocket
    const client = getWsClient();

    if (client) {
      // Use splitLink to route subscriptions to WebSocket, rest to HTTP
      links.push(
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: wsLink({ client }),
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            headers() {
              const headers: Record<string, string> = {
                'x-trpc-source': 'react',
                // ADR-053: forward a request-correlation id so the API tracing
                // middleware + query-budget events correlate on a boundary id.
                'x-request-id': generateRequestId(),
                // ADR-071: the tenant the user is acting in (absent = home tenant)
                ...activeTenantHeaders(),
              };

              // Only include Authorization header if token is valid (not expired)
              const accessToken = getValidAccessToken();
              if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
              }

              return headers;
            },
          }),
        })
      );
    } else {
      // SSR or no WebSocket - use HTTP only. Subscriptions must not reach
      // httpBatchLink (it throws, crashing any page with a live-update hook);
      // they complete quietly instead — see lib/no-realtime-link.ts.
      links.push(
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: noRealtimeLink,
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            headers() {
              const headers: Record<string, string> = {
                'x-trpc-source': 'react',
                // ADR-053: forward a request-correlation id (see above).
                'x-request-id': generateRequestId(),
                // ADR-071: the tenant the user is acting in (absent = home tenant)
                ...activeTenantHeaders(),
              };

              // Only include Authorization header if token is valid (not expired)
              const accessToken = getValidAccessToken();
              if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
              }

              return headers;
            },
          }),
        })
      );
    }

    return trpc.createClient({ links });
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TimezoneProvider>
            <RemindersProvider autoStart={true} checkInterval={60000}>
              {children}
            </RemindersProvider>
          </TimezoneProvider>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
