/**
 * React tRPC Client
 *
 * Provides React Query hooks for tRPC endpoints.
 * This enables:
 * - Automatic caching
 * - Optimistic updates
 * - Background refetching
 * - Suspense support
 */

'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@intelliflow/api';

/**
 * Create the tRPC React client
 */
export const trpc = createTRPCReact<AppRouter>();

export interface TRPCProviderProps {
  children: React.ReactNode;
  /**
   * The base URL of the tRPC API
   * @example "/api/trpc" or "http://localhost:3000/api/trpc"
   */
  url: string;

  /**
   * Optional headers to include with every request
   * Useful for authentication tokens
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;

  /**
   * Optional custom QueryClient
   * If not provided, a default QueryClient will be created
   */
  queryClient?: QueryClient;
}

/**
 * tRPC Provider Component
 *
 * Wrap your React app with this component to enable tRPC hooks.
 *
 * @example
 * ```tsx
 * import { TRPCProvider } from '@intelliflow/api-client';
 *
 * function App() {
 *   return (
 *     <TRPCProvider url="/api/trpc">
 *       <YourApp />
 *     </TRPCProvider>
 *   );
 * }
 * ```
 */
export function TRPCProvider({
  children,
  url,
  headers,
  queryClient: providedQueryClient,
}: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      providedQueryClient ||
      new QueryClient({
        defaultOptions: {
          queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url,
          headers,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Example usage of tRPC React hooks:
 *
 * @example Query Hook
 * ```tsx
 * import { trpc } from '@intelliflow/api-client';
 *
 * function LeadsList() {
 *   const { data, isLoading, error } = trpc.lead.list.useQuery({
 *     page: 1,
 *     limit: 20,
 *     status: ['NEW', 'CONTACTED'],
 *   });
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <ul>
 *       {data.leads.map((lead) => (
 *         <li key={lead.id}>{lead.email}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @example Mutation Hook
 * ```tsx
 * import { trpc } from '@intelliflow/api-client';
 *
 * function CreateLeadForm() {
 *   const utils = trpc.useContext();
 *   const createLead = trpc.lead.create.useMutation({
 *     onSuccess: () => {
 *       // Invalidate and refetch leads list
 *       utils.lead.list.invalidate();
 *     },
 *   });
 *
 *   const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
 *     e.preventDefault();
 *     const formData = new FormData(e.currentTarget);
 *     createLead.mutate({
 *       email: formData.get('email') as string,
 *       firstName: formData.get('firstName') as string,
 *       lastName: formData.get('lastName') as string,
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="email" type="email" required />
 *       <input name="firstName" />
 *       <input name="lastName" />
 *       <button type="submit" disabled={createLead.isLoading}>
 *         {createLead.isLoading ? 'Creating...' : 'Create Lead'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 *
 * @example Optimistic Updates
 * ```tsx
 * const utils = trpc.useContext();
 * const updateLead = trpc.lead.update.useMutation({
 *   onMutate: async (newData) => {
 *     // Cancel outgoing refetches
 *     await utils.lead.getById.cancel({ id: newData.id });
 *
 *     // Snapshot the previous value
 *     const previousLead = utils.lead.getById.getData({ id: newData.id });
 *
 *     // Optimistically update to the new value
 *     utils.lead.getById.setData({ id: newData.id }, (old) => ({
 *       ...old!,
 *       ...newData,
 *     }));
 *
 *     return { previousLead };
 *   },
 *   onError: (err, newData, context) => {
 *     // Rollback on error
 *     utils.lead.getById.setData(
 *       { id: newData.id },
 *       context?.previousLead
 *     );
 *   },
 *   onSettled: (data) => {
 *     // Refetch after error or success
 *     if (data) {
 *       utils.lead.getById.invalidate({ id: data.id });
 *     }
 *   },
 * });
 * ```
 */
