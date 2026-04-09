/**
 * tRPC API Route Handler
 *
 * This Next.js API route handles all tRPC requests by forwarding them
 * to the tRPC router from @intelliflow/api.
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '@intelliflow/api/context';
import { appRouter } from '@intelliflow/api/router';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
    onError: ({ path, error }) => {
      console.error(`[tRPC Error] ${path ?? 'unknown'}: ${error.message}`);
    },
  });

export { handler as GET, handler as POST };
