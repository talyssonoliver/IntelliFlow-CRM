/**
 * Team Router
 *
 * Tenant-scoped team listing. Used by EntitySearchField (approver /
 * assignee pickers) and the workflow builder's human-approver and
 * create_task variants.
 *
 * Task: IFC-031 FU-005 — extend EntitySearchField with user/team kinds
 */

import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

export const teamRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();
      const where: Record<string, unknown> = {
        tenantId: ctx.tenant.tenantId,
        isActive: true,
      };
      if (search && search.length > 0) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      const teams = await ctx.prismaWithTenant.team.findMany({
        where: where as never,
        select: {
          id: true,
          name: true,
          description: true,
        },
        take: input.limit,
        orderBy: { name: 'asc' },
      });

      return { teams };
    }),
});
