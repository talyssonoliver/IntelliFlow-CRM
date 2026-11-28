/**
 * MVP-014 "Who is waiting": the dashboard card reads this. The leads list filter
 * "Waiting for reply" uses the same loader (see lead.list), so the two always agree.
 */

import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { getTenantContext } from '../../security/tenant-context';
import { mailViewerOf } from '@intelliflow/db';
import { loadWaitingPage } from './waiting-sql';

export const waitingRouter = createTRPCRouter({
  /** Oldest first. `total` counts everyone waiting, `items` is the first `limit`. */
  list: tenantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const typed = getTenantContext(ctx);
      // Decided in SQL (waiting-sql.ts): only the `limit` people to show and the counts come back,
      // not the tenant's mail. The tenant and the viewer's owner scope are in the statement.
      return loadWaitingPage(typed.prismaWithTenant, mailViewerOf(typed.tenant), {
        limit: input?.limit ?? 5,
      });
    }),
});
