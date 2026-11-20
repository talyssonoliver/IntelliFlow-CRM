/**
 * MVP-014 "Who is waiting": the dashboard card reads this. The leads list filter
 * "Waiting for reply" uses the same loader (see lead.list), so the two always agree.
 */

import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { createTenantWhereClause, getTenantContext } from '../../security/tenant-context';
import { loadWaiting } from './waiting-load';

export const waitingRouter = createTRPCRouter({
  /** Oldest first. `total` counts everyone waiting, `items` is the first `limit`. */
  list: tenantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const typed = getTenantContext(ctx);
      const { tenantId } = typed.tenant;
      const all = await loadWaiting(
        typed.prismaWithTenant,
        tenantId,
        createTenantWhereClause(typed.tenant),
        createTenantWhereClause(typed.tenant)
      );
      return {
        items: all.slice(0, input?.limit ?? 5),
        total: all.length,
        leadTotal: all.filter((i) => i.kind === 'lead').length,
        contactTotal: all.filter((i) => i.kind === 'contact').length,
      };
    }),
});
