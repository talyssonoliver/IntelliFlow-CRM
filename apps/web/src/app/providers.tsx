'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { RemindersProvider } from '@/lib/cases/reminders-context';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000, // React Query v5 uses gcTime (v4 used cacheTime)
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            // IFC-007: Send Authorization header with JWT token from localStorage
            const headers: Record<string, string> = {
              'x-trpc-source': 'react',
            };

            // Get access token from localStorage (set during login)
            if (typeof window !== 'undefined') {
              const accessToken = localStorage.getItem('accessToken');
              if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
                console.log('[tRPC] Sending Authorization header with token:', accessToken.substring(0, 30) + '...');
              } else {
                console.log('[tRPC] No accessToken in localStorage');
              }
            }

            return headers;
          },
        }),
      ],
    })
  );

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
