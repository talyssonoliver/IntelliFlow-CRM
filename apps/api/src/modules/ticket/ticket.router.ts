/**
 * Ticket Router
 *
 * Provides type-safe tRPC endpoints for support ticket management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Ticket statistics for dashboard
 * - Add responses to tickets
 * - SLA tracking
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createTicketSchema,
  updateTicketSchema,
  ticketQuerySchema,
  addResponseSchema,
  idSchema,
} from '@intelliflow/validators/ticket';
import { type Context } from '../../context';
import {
  assertTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Helper to get ticket service from context
 */
function getTicketService(ctx: Context) {
  if (!ctx.services?.ticket) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ticket service not available',
    });
  }
  return ctx.services.ticket;
}

/**
 * Helper to get tenant ID from context
 */
async function getTenantId(ctx: Context): Promise<string> {
  // TODO: Extract from user session when multi-tenancy is implemented
  // For now, get the default tenant from the database
  const tenant = await ctx.prisma.tenant.findUnique({
    where: { slug: 'default' },
  });

  if (!tenant) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Default tenant not found',
    });
  }

  return tenant.id;
}

export const ticketRouter = createTRPCRouter({
  /**
   * Create a new ticket
   */
  create: tenantProcedure.input(createTicketSchema).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);
    const tenantId = await getTenantId(ctx);

    try {
      const ticket = await ticketService.create({
        ...input,
        tenantId,
      });

      return ticket;
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to create ticket',
      });
    }
  }),

  /**
   * Get a single ticket by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);

    const ticket = await ticketService.findById(input.id);

    if (!ticket) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    return ticket;
  }),

  /**
   * List tickets with filtering and pagination
   */
  list: tenantProcedure.input(ticketQuerySchema).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const ticketService = getTicketService(ctx);
    const tenantId = await getTenantId(ctx);

    const { page = 1, limit = 20, status, priority, assignedToId } = input;
    const offset = (page - 1) * limit;

    const result = await ticketService.findMany({
      status,
      priority,
      assignedToId,
      limit,
      offset,
      tenantId,
    });

    return {
      tickets: result.tickets,
      total: result.total,
      page,
      limit,
      hasMore: result.hasMore,
    };
  }),

  /**
   * Update a ticket
   */
  update: tenantProcedure.input(updateTicketSchema).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);

    const { id, ...updateData } = input;

    try {
      const ticket = await ticketService.update(id, {
        subject: updateData.subject,
        description: updateData.description,
        status: updateData.status,
        priority: updateData.priority,
        assigneeId: updateData.assigneeId ?? undefined,
      });
      return ticket;
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to update ticket',
      });
    }
  }),

  /**
   * Delete a ticket (soft delete)
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);

    try {
      await ticketService.delete(input.id);
      return { success: true };
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to delete ticket',
      });
    }
  }),

  /**
   * Get ticket statistics for dashboard
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    const ticketService = getTicketService(ctx);
    const tenantId = await getTenantId(ctx);

    const stats = await ticketService.getStats(tenantId);

    return stats;
  }),

  /**
   * Add a response to a ticket
   */
  addResponse: tenantProcedure.input(addResponseSchema).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);

    try {
      await ticketService.addResponse(
        input.ticketId,
        input.content,
        input.authorName,
        input.authorRole
      );

      return { success: true };
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to add response',
      });
    }
  }),

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Bulk assign tickets to an agent
   */
  bulkAssign: tenantProcedure
    .input(z.object({
      ticketIds: z.array(z.string()),
      assigneeId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticketService = getTicketService(ctx);
      const { ticketIds, assigneeId } = input;

      let successCount = 0;
      for (const ticketId of ticketIds) {
        try {
          await ticketService.update(ticketId, { assigneeId });
          successCount++;
        } catch {
          // Continue with other tickets even if one fails
        }
      }

      return { success: true, updated: successCount };
    }),

  /**
   * Bulk update ticket status
   */
  bulkUpdateStatus: tenantProcedure
    .input(z.object({
      ticketIds: z.array(z.string()),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticketService = getTicketService(ctx);
      const { ticketIds, status } = input;

      let successCount = 0;
      for (const ticketId of ticketIds) {
        try {
          await ticketService.update(ticketId, { status });
          successCount++;
        } catch {
          // Continue with other tickets
        }
      }

      return { success: true, updated: successCount };
    }),

  /**
   * Bulk resolve tickets
   */
  bulkResolve: tenantProcedure
    .input(z.object({
      ticketIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticketService = getTicketService(ctx);
      const { ticketIds } = input;

      let successCount = 0;
      for (const ticketId of ticketIds) {
        try {
          await ticketService.update(ticketId, { status: 'RESOLVED' });
          successCount++;
        } catch {
          // Continue with other tickets
        }
      }

      return { success: true, updated: successCount };
    }),

  /**
   * Bulk escalate tickets
   */
  bulkEscalate: tenantProcedure
    .input(z.object({
      ticketIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticketService = getTicketService(ctx);
      const { ticketIds } = input;

      let successCount = 0;
      for (const ticketId of ticketIds) {
        try {
          await ticketService.update(ticketId, { priority: 'CRITICAL' });
          successCount++;
        } catch {
          // Continue with other tickets
        }
      }

      return { success: true, updated: successCount };
    }),

  /**
   * Bulk close tickets
   */
  bulkClose: tenantProcedure
    .input(z.object({
      ticketIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticketService = getTicketService(ctx);
      const { ticketIds } = input;

      let successCount = 0;
      for (const ticketId of ticketIds) {
        try {
          await ticketService.update(ticketId, { status: 'CLOSED' });
          successCount++;
        } catch {
          // Continue with other tickets
        }
      }

      return { success: true, updated: successCount };
    }),

  /**
   * Get filter options with counts
   *
   * Returns available filter values with count of matching records.
   * Used for dynamic filters that hide options with 0 matches.
   */
  filterOptions: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        slaStatus: z.string().optional(),
        assigneeId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      const tenantId = await getTenantId(ctx);

      // Build base where clause with current filters
      const baseWhere: Record<string, unknown> = { tenantId };

      if (input?.status) {
        baseWhere.status = input.status;
      }

      if (input?.priority) {
        baseWhere.priority = input.priority;
      }

      if (input?.slaStatus) {
        baseWhere.slaStatus = input.slaStatus;
      }

      if (input?.assigneeId) {
        baseWhere.assignedToId = input.assigneeId;
      }

      // Get counts for each filter option
      const [statusCounts, priorityCounts, slaCounts] = await Promise.all([
        ctx.prisma.ticket.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: true,
        }),
        ctx.prisma.ticket.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: true,
        }),
        ctx.prisma.ticket.groupBy({
          by: ['slaStatus'],
          where: baseWhere,
          _count: true,
        }),
      ]);

      return {
        statuses: statusCounts.map(s => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
        priorities: priorityCounts.map(p => ({
          value: p.priority,
          label: p.priority,
          count: p._count,
        })),
        slaStatuses: slaCounts.map(s => ({
          value: s.slaStatus,
          label: s.slaStatus,
          count: s._count,
        })),
      };
    }),
});
