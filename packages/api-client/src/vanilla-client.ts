/**
 * Vanilla tRPC Client
 *
 * Creates a type-safe tRPC client for server-side or non-React usage.
 * This is useful for:
 * - Server-side rendering (SSR)
 * - API routes
 * - Background workers
 * - Testing
 */

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api';

export interface TRPCClientConfig {
  /**
   * The base URL of the tRPC API
   * @example "http://localhost:3000/api/trpc"
   */
  url: string;

  /**
   * Optional headers to include with every request
   * Useful for authentication tokens
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;

  /**
   * Optional fetch implementation
   * Useful for custom fetch behavior or server-side fetch
   */
  fetch?: typeof fetch;
}

/**
 * Create a vanilla tRPC client
 *
 * @example
 * ```ts
 * const client = createTRPCClient({
 *   url: 'http://localhost:3000/api/trpc',
 *   headers: async () => ({
 *     authorization: `Bearer ${await getToken()}`,
 *   }),
 * });
 *
 * // Use the client
 * const leads = await client.lead.list.query({ page: 1, limit: 20 });
 * const newLead = await client.lead.create.mutate({
 *   email: 'john@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe',
 * });
 * ```
 */
export function createTRPCClient(config: TRPCClientConfig) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: config.url,
        headers: config.headers,
        fetch: config.fetch,
      }),
    ],
  });
}
