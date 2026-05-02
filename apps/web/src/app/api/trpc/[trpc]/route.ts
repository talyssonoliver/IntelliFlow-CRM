/**
 * tRPC API Route Handler
 *
 * This Next.js API route handles all tRPC requests by forwarding them
 * to the tRPC router from @intelliflow/api.
 *
 * `dynamic = 'force-dynamic'` opts this route out of Next.js static generation /
 * page-data collection at build time.  Without it, Next probes the route module
 * during `next build` which triggers the full import chain (container → Prisma
 * client → env-var guards) before any env vars are available, causing a build
 * failure in CI where DATABASE_URL / AI_AUDIT_SIGNING_KEY are not set.
 *
 * `runtime = 'nodejs'` pins the route to the Node.js runtime so it is never
 * bundled for the Edge runtime, which cannot load the Prisma pg adapter or
 * ioredis at build time.
 */
export const dynamic = 'force-dynamic';
// Note: `runtime = 'nodejs'` is intentionally omitted — it is incompatible with
// `experimental.useCache` (next.config.js).  The route is implicitly Node.js
// because @intelliflow/db and bullmq are listed in `serverExternalPackages`.

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
