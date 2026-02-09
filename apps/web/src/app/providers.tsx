'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { httpBatchLink, splitLink, createWSClient, wsLink } from '@trpc/client';
import { useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { AuthProvider } from '@/lib/auth';
import { RemindersProvider } from '@/lib/cases/reminders-context';
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
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

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
      document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }

    return isValid;
  } catch {
    // Invalid token format
    console.log('[Auth] Invalid token format, clearing...');
    localStorage.removeItem('accessToken');
    return false;
  }
}

/**
 * Get valid access token from localStorage
 * Returns null if token is missing or expired
 */
function getValidAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function getWsUrl() {
  if (typeof window === 'undefined') return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? '3001';
  // In production, use same host; in dev, use localhost with WS_PORT
  if (process.env.NODE_ENV === 'production') {
    return `${protocol}//${window.location.host}/ws`;
  }
  return `${protocol}//localhost:${wsPort}`;
}

// Singleton WebSocket client (created once per browser session)
let wsClient: ReturnType<typeof createWSClient> | null = null;

function getWsClient() {
  if (typeof window === 'undefined') return null;

  if (!wsClient) {
    const wsUrl = getWsUrl();
    if (wsUrl) {
      wsClient = createWSClient({
        url: wsUrl,
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

export function Providers({ children }: { children: React.ReactNode }) {
  // Track if we've already triggered a redirect to prevent multiple redirects
  const isRedirectingRef = useRef(false);

  /**
   * Handle global auth errors - redirect to login once
   * This prevents 401 console spam and provides a single point of auth handling
   */
  const handleAuthError = useCallback(() => {
    if (isRedirectingRef.current) return;
    if (typeof window === 'undefined') return;

    // Check if we're already on the login page
    if (window.location.pathname === '/login') return;

    console.log('[QueryClient] Auth error detected, redirecting to login...');
    isRedirectingRef.current = true;

    // Clear invalid token
    localStorage.removeItem('accessToken');
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    // Redirect to login
    window.location.href = '/login';
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
            const isAuthStatusQuery = Array.isArray(queryKey) &&
              queryKey.some(k =>
                Array.isArray(k) && k.includes('auth') && k.includes('getStatus')
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
          <RemindersProvider autoStart={true} checkInterval={60000}>
            {children}
          </RemindersProvider>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
