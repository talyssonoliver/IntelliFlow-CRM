'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { httpBatchLink, splitLink, createWSClient, wsLink } from '@trpc/client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { AuthProvider } from '@/lib/auth';
import { TimezoneProvider } from '@/providers/TimezoneProvider';
import { RemindersProvider } from '@/lib/cases/reminders-context';
import { AUTH_TOKEN_CHANGED_EVENT, clearTokenCookie } from '@/lib/shared/session-cleanup';
// NOTE: We use a custom tRPC setup instead of TRPCProvider from @intelliflow/api-client
// because we need:
// - WebSocket support for real-time subscriptions
// - Custom auth error handling with automatic redirect
// - Token validation before including in headers

/**
 * Check if an error is an authentication error (401 UNAUTHORIZED)
 */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // Check tRPC error shape
  const err = error as { data?: { code?: string }; message?: string };
  if (err.data?.code === 'UNAUTHORIZED') return true;

  // Check error message
  const message = err.message?.toLowerCase() ?? '';
  return message.includes('unauthorized') || message.includes('authentication required');
}

/**
 * Decode JWT token and check if it's expired
 * Returns true if token is valid (not expired), false otherwise
 */
function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode payload (base64url)
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));

    // Check expiry (exp is in seconds)
    if (!payload.exp) return false;

    // Add 30 second buffer to avoid edge cases
    const expiryTime = payload.exp * 1000;
    const now = Date.now();
    const isValid = now < expiryTime - 30000;

    if (!isValid) {
      console.log('[Auth] Token expired or expiring soon, clearing...');
      // Clear expired token
      localStorage.removeItem('accessToken');
      clearTokenCookie();
    }

    return isValid;
  } catch {
    // Invalid token format
    console.log('[Auth] Invalid token format, clearing...');
    localStorage.removeItem('accessToken');
    clearTokenCookie();
    return false;
  }
}

/**
 * Get valid access token from localStorage
 * Returns null if token is missing or expired
 */
function getValidAccessToken(): string | null {
  if (typeof globalThis.window === 'undefined') return null;

  const token = localStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
}

function getBaseUrl() {
  if (typeof globalThis.window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

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

function getWsUrl() {
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
          return {
            authorization: accessToken ? `Bearer ${accessToken}` : undefined,
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

    // Redirect to login
    globalThis.location.href = '/login';
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
            retry: (failureCount, error) => {
              if (isAuthError(error)) return false;
              return failureCount < 3;
            },
          },
          mutations: {
            // Don't retry mutations on auth errors
            retry: (failureCount, error) => {
              if (isAuthError(error)) return false;
              return failureCount < 3;
            },
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
          },
        }),
        // Global mutation cache error handler
        mutationCache: new MutationCache({
          onError: (error) => {
            if (isAuthError(error)) {
              handleAuthError();
            }
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
      // SSR or no WebSocket - use HTTP only
      links.push(
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            const headers: Record<string, string> = {
              'x-trpc-source': 'react',
              // ADR-053: forward a request-correlation id (see above).
              'x-request-id': generateRequestId(),
            };

            // Only include Authorization header if token is valid (not expired)
            const accessToken = getValidAccessToken();
            if (accessToken) {
              headers['Authorization'] = `Bearer ${accessToken}`;
            }

            return headers;
          },
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
