/**
 * MVP-014 "Who is waiting": the dashboard card reads this. The leads list filter
 * "Waiting for reply" uses the same loader (see lead.list), so the two always agree.
 */

import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { createTenantWhereClause, getTenantContext } from '../../security/tenant-context';
import { mailViewerOf } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';
import { loadWaiting } from './waiting-load';
import { loadWaitingPage } from './waiting-sql';
import { personKey } from './waiting-for-reply';

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

  /**
   * "Handled without a reply" (MVP-012): hides this person's current wait. It remembers the wait's
   * `since` and `unanswered`, so a newer inbound email brings the person back.
   */
  dismiss: tenantProcedure
    .input(z.object({ kind: z.enum(['lead', 'contact']), id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const typed = getTenantContext(ctx);
      const all = await loadWaiting(
        typed.prismaWithTenant,
        mailViewerOf(typed.tenant),
        createTenantWhereClause(typed.tenant),
        createTenantWhereClause(typed.tenant)
      );
      const item = all.find((i) => i.kind === input.kind && i.id === input.id);
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nobody is waiting for a reply here' });
      }
      const key = personKey(input.kind, input.id);
      const data = {
        since: item.since,
        unanswered: item.unanswered,
        latestAt: item.latestAt,
        dismissedById: typed.tenant.userId,
      };
      await typed.prismaWithTenant.waitingDismissal.upsert({
        where: { tenantId_personKey: { tenantId: typed.tenant.tenantId, personKey: key } },
        create: { tenantId: typed.tenant.tenantId, personKey: key, ...data },
        update: data,
      });
      return { dismissed: true as const };
    }),
});
