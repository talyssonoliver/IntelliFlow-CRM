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
  addAttachmentSchema,
  idSchema,
  ticketStatusSchema,
  statsInputSchema,
} from '@intelliflow/validators/ticket';
import { type Context } from '../../context';
import { assertTenantContext } from '../../security/tenant-context';
import { createNotification } from '../notifications/notifications.router';

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

function getAssigneeTitle(role?: string | null): string {
  switch (role) {
    case 'ADMIN':
      return 'Support Admin';
    case 'MANAGER':
      return 'Support Manager';
    case 'SALES_REP':
      return 'Support Specialist';
    case 'USER':
    default:
      return 'Support Agent';
  }
}

// =============================================================================
// Post-creation side-effect helpers (all fire-and-forget, non-blocking)
// =============================================================================

/**
 * Notify the assigned agent (in-app) and enqueue an email notification via BullMQ.
 */
function notifyAssignee(
  ctx: Context,
  params: { assigneeId: string; tenantId: string; ticketId: string; subject: string }
) {
  // In-app notification
  createNotification(ctx.prisma, {
    userId: params.assigneeId,
    tenantId: params.tenantId,
    type: 'ticket_assigned',
    title: 'Ticket assigned to you',
    body: `Ticket "${params.subject}" has been assigned to you`,
    priority: 'normal',
    entityType: 'ticket',
    entityId: params.ticketId,
    entityName: params.subject,
    actionUrl: `/tickets/${params.ticketId}`,
  }).catch(() => {});

  // BullMQ email notification (fire-and-forget)
  (async () => {
    const { Queue } = await import('bullmq');
    const { QUEUE_NAMES, DEFAULT_QUEUE_CONFIGS } = await import('@intelliflow/platform/queues');
    const qConfig = DEFAULT_QUEUE_CONFIGS[QUEUE_NAMES.EMAIL_NOTIFICATIONS];
    const queue = new Queue(QUEUE_NAMES.EMAIL_NOTIFICATIONS, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      defaultJobOptions: {
        attempts: qConfig.defaultJobOptions.attempts,
        backoff: {
          type: qConfig.defaultJobOptions.backoff.type,
          delay: qConfig.defaultJobOptions.backoff.delay,
        },
        removeOnComplete: qConfig.defaultJobOptions.removeOnComplete,
        removeOnFail: qConfig.defaultJobOptions.removeOnFail,
      },
    });
    await queue.add('notification:email', {
      type: 'ticket_assigned',
      recipientUserId: params.assigneeId,
      tenantId: params.tenantId,
      subject: `Ticket assigned: ${params.subject}`,
      body: `Ticket "${params.subject}" has been assigned to you. View it at /tickets/${params.ticketId}`,
      entityType: 'ticket',
      entityId: params.ticketId,
    });
    await queue.close();
  })().catch(() => {});
}

/**
 * Enhancement 1: Auto-route unassigned tickets using the routing service.
 * Attempts to find an eligible agent and assign the ticket automatically.
 * If routing succeeds, sends an assignment notification to the routed agent.
 */
function autoRouteNewTicket(
  ctx: Context,
  params: { ticketId: string; tenantId: string; category?: string; subject: string }
) {
  const routingService = (ctx.services as Record<string, any>)?.ticketRouting;
  if (!routingService) return;

  const category = params.category || 'GENERAL';

  (async () => {
    // Find eligible agents
    const candidates = await routingService.suggestAssignees(params.tenantId, category, 10);
    if (candidates.length === 0) return; // No agents available — leave unassigned

    // Check for a matching routing rule first
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { priority: true, status: true },
    });
    if (!ticket || ticket.status === 'ARCHIVED') return;

    const matchingRule = await routingService.findMatchingRule(
      params.tenantId,
      category,
      ticket.priority
    );

    let assigneeId: string;
    let assigneeName: string;
    let reason: string;
    let routingMethod: string;
    let matchedSkill: string | null = null;
    let ruleId: string | null = null;

    if (matchingRule) {
      assigneeId = matchingRule.assignToUserId;
      assigneeName =
        candidates.find((c: { agentId: string }) => c.agentId === matchingRule.assignToUserId)
          ?.name || 'Unknown';
      reason = `Auto-routed on creation: rule match "${matchingRule.ruleName}"`;
      routingMethod = 'rule_match';
      ruleId = matchingRule.id;
    } else {
      // Skill/load balance — pick the top candidate
      assigneeId = candidates[0].agentId;
      assigneeName = candidates[0].name;
      reason = `Auto-routed on creation: skill match for ${category}`;
      routingMethod = 'skill_match';
      matchedSkill = candidates[0].skills?.[0] || null;
    }

    await routingService.routeTicket({
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      inferredCategory: category,
      assigneeId,
      assigneeName,
      reason,
      routingMethod,
      matchedSkill,
      ruleId,
      confidence: 0.85,
      executionTimeMs: 0,
      modelVersion: 'router:v1-auto',
      isFallback: false,
    });

    // Notify the auto-assigned agent
    notifyAssignee(ctx, {
      assigneeId,
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      subject: params.subject,
    });
  })().catch(() => {});
}

/**
 * Enhancement 2: Notify ADMIN and MANAGER users when a ticket is created unassigned.
 */
function notifyTeamUnassigned(
  ctx: Context,
  params: { tenantId: string; ticketId: string; subject: string; priority: string }
) {
  (async () => {
    const teamMembers = await ctx.prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        role: { in: ['ADMIN', 'MANAGER'] },
      },
      select: { id: true },
    });

    const priorityLabel: 'high' | 'normal' = params.priority === 'CRITICAL' || params.priority === 'HIGH' ? 'high' : 'normal';

    for (const member of teamMembers) {
      createNotification(ctx.prisma, {
        userId: member.id,
        tenantId: params.tenantId,
        type: 'ticket_created',
        title: 'New unassigned ticket',
        body: `[${params.priority}] "${params.subject}" needs assignment`,
        priority: priorityLabel,
        entityType: 'ticket',
        entityId: params.ticketId,
        entityName: params.subject,
        actionUrl: `/tickets/${params.ticketId}`,
        actionLabel: 'View & Assign',
      }).catch(() => {});
    }
  })().catch(() => {});
}

/**
 * Enhancement 4: Write a TicketActivity on the contact's record when a ticket
 * is created for them, linking the ticket to their activity timeline.
 */
function writeContactActivity(
  ctx: Context,
  params: {
    tenantId: string;
    contactEmail: string;
    contactName: string;
    ticketId: string;
    subject: string;
  }
) {
  (async () => {
    // Look up the contact by email
    const contact = await ctx.prisma.contact.findFirst({
      where: { email: params.contactEmail, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!contact) return;

    // Write to the contact's activity log
    await ctx.prisma.contactActivity.create({
      data: {
        contactId: contact.id,
        tenantId: params.tenantId,
        type: 'TICKET',
        title: `Support ticket created: ${params.subject}`,
        description: `A support ticket "${params.subject}" was created for ${params.contactName}`,
        userName: 'System',
        metadata: {
          ticketId: params.ticketId,
          ticketSubject: params.subject,
        },
      },
    });
  })().catch(() => {});
}

export const ticketRouter = createTRPCRouter({
  /**
   * Create a new ticket
   */
  create: tenantProcedure.input(createTicketSchema).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);
    const tenantId = ctx.tenant.tenantId;

    try {
      const ticket = await ticketService.create({
        ...input,
        tenantId,
      });

      // --- Post-creation side effects (all fire-and-forget) ---

      if (input.assigneeId) {
        // Notify the assigned agent
        notifyAssignee(ctx, {
          assigneeId: input.assigneeId,
          tenantId,
          ticketId: ticket.id,
          subject: input.subject,
        });
      } else {
        // Enhancement 1: Auto-route unassigned tickets
        autoRouteNewTicket(ctx, {
          ticketId: ticket.id,
          tenantId,
          category: input.category,
          subject: input.subject,
        });

        // Enhancement 2: Notify team leads/admins about unassigned ticket
        notifyTeamUnassigned(ctx, {
          tenantId,
          ticketId: ticket.id,
          subject: input.subject,
          priority: input.priority,
        });
      }

      // Enhancement 4: Write activity to contact's feed
      if (input.contactEmail) {
        writeContactActivity(ctx, {
          tenantId,
          contactEmail: input.contactEmail,
          contactName: input.contactName,
          ticketId: ticket.id,
          subject: input.subject,
        });
      }

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
    const startTime = performance.now();
    assertTenantContext(ctx);
    const ticketService = getTicketService(ctx);
    const tenantId = ctx.tenant.tenantId;

    const {
      page = 1,
      limit = 20,
      status,
      priority,
      assignedToId,
      search,
      sortBy,
      sortOrder,
    } = input;
    const offset = (page - 1) * limit;

    const result = await ticketService.findMany({
      status,
      priority,
      assignedToId,
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
      tenantId,
    });

    const queryDurationMs = performance.now() - startTime;
    console.log(
      `[ticket.list] Fetched ${result.total} tickets (page ${page}) in ${queryDurationMs.toFixed(2)}ms`
    );
    if (queryDurationMs > 200) {
      console.warn(`[ticket.list] SLOW: ${queryDurationMs.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      tickets: result.tickets,
      total: result.total,
      page,
      limit,
      hasMore: result.hasMore,
      queryDurationMs,
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

      // Fire-and-forget: notification failure must not block the ticket update response
      if (updateData.priority && ['URGENT', 'CRITICAL'].includes(updateData.priority)) {
        const tenantId = ctx.tenant.tenantId;
        createNotification(ctx.prisma, {
          userId: ticket.assigneeId || 'system',
          tenantId,
          type: 'ticket_escalated',
          title: 'Ticket escalated',
          body: `Ticket "${ticket.subject}" escalated to ${updateData.priority}`,
          priority: 'high',
          entityType: 'ticket',
          entityId: ticket.id,
          entityName: ticket.subject,
          actionUrl: `/tickets/${ticket.id}`,
        }).catch(() => {}); // Swallow notification errors — non-critical side-effect
      }

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
   * Archive a resolved or closed ticket
   */
  archive: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const ticketService = getTicketService(ctx);

    try {
      await ticketService.archive(input.id);
      return { success: true };
    } catch (error) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to archive ticket',
      });
    }
  }),

  /**
   * Get ticket statistics for dashboard
   */
  stats: tenantProcedure.input(statsInputSchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();
    const ticketService = getTicketService(ctx);
    const tenantId = ctx.tenant.tenantId;

    const stats = await ticketService.getStats(tenantId, input.timeWindow);

    const queryDurationMs = performance.now() - startTime;
    console.log(
      `[ticket.stats] Computed stats (${input.timeWindow}) in ${queryDurationMs.toFixed(2)}ms`
    );
    if (queryDurationMs > 500) {
      console.warn(`[ticket.stats] SLOW: ${queryDurationMs.toFixed(2)}ms (target: <500ms)`);
    }

    return { ...stats, queryDurationMs };
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
    .input(
      z.object({
        ticketIds: z.array(z.string()),
        assigneeId: z.string(),
      })
    )
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
    .input(
      z.object({
        ticketIds: z.array(z.string()),
        status: ticketStatusSchema,
      })
    )
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
    .input(
      z.object({
        ticketIds: z.array(z.string()),
      })
    )
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
    .input(
      z.object({
        ticketIds: z.array(z.string()),
      })
    )
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
    .input(
      z.object({
        ticketIds: z.array(z.string()),
      })
    )
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
   * Team assignees for assignment actions
   */
  assignees: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;

    const users = await ctx.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: (user.name || user.email).trim(),
      title: getAssigneeTitle(user.role),
      avatar: user.avatarUrl ?? null,
    }));
  }),

  /**
   * Get filter options with counts
   *
   * Returns available filter values with count of matching records.
   * Used for dynamic filters that hide options with 0 matches.
   */
  filterOptions: tenantProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.string().optional(),
          priority: z.string().optional(),
          slaStatus: z.string().optional(),
          assigneeId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      const tenantId = ctx.tenant.tenantId;

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
        statuses: statusCounts.map((s) => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
        priorities: priorityCounts.map((p) => ({
          value: p.priority,
          label: p.priority,
          count: p._count,
        })),
        slaStatuses: slaCounts.map((s) => ({
          value: s.slaStatus,
          label: s.slaStatus,
          count: s._count,
        })),
      };
    }),

  /**
   * Add attachment to a ticket (PG-047)
   */
  addAttachment: tenantProcedure
    .input(addAttachmentSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      // Verify ticket exists and belongs to tenant
      const ticket = await ctx.prisma.ticket.findFirst({
        where: { id: input.ticketId, tenantId },
        select: { id: true },
      });

      if (!ticket) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        });
      }

      // Determine file type enum from MIME type
      const fileTypeMap: Record<string, string> = {
        'image/jpeg': 'IMAGE',
        'image/png': 'IMAGE',
        'image/gif': 'IMAGE',
        'image/webp': 'IMAGE',
        'application/pdf': 'PDF',
        'application/msword': 'DOCUMENT',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
        'text/plain': 'DOCUMENT',
        'text/csv': 'SPREADSHEET',
        'application/zip': 'ARCHIVE',
      };
      const dbFileType = fileTypeMap[input.fileType] ?? 'OTHER';

      const attachment = await ctx.prisma.ticketAttachment.create({
        data: {
          name: input.name,
          size: input.size,
          sizeBytes: input.sizeBytes,
          fileType: dbFileType as never,
          url: `data:${input.fileType};base64,${input.content.slice(0, 100)}...`,
          ticketId: input.ticketId,
          uploadedById: ctx.user?.userId ?? null,
          tenantId,
        },
      });

      return { id: attachment.id, name: attachment.name, size: attachment.size };
    }),
});
