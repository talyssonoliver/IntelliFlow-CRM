/**
 * Task Router
 *
 * Provides type-safe tRPC endpoints for task management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Task completion and tracking
 *
 * Following hexagonal architecture - uses TaskService for business logic.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  completeTaskSchema,
  idSchema,
} from '@intelliflow/validators/task';
import { mapTaskToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Helper to get task service from context
 */
function getTaskService(ctx: Context) {
  if (!ctx.services?.task) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Task service not available',
    });
  }
  return ctx.services.task;
}

export const taskRouter = createTRPCRouter({
  /**
   * Create a new task
   */
  create: tenantProcedure.input(createTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);

    const result = await taskService.createTask({
      ...input,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      const errorCode = result.error.code;
      const message = result.error.message;
      if (errorCode === 'VALIDATION_ERROR') {
        // Check if it's an entity not found error
        if (message.includes('not found') || message.includes('Lead') || message.includes('Contact') || message.includes('Opportunity')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message,
      });
    }

    return mapTaskToResponse(result.value);
  }),

  /**
   * Get a single task by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);

    const result = await taskService.getTaskById(input.id);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    return mapTaskToResponse(result.value);
  }),

  /**
   * List tasks with filtering and pagination
   */
  list: tenantProcedure.input(taskQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const {
      page = 1,
      limit = 20,
      search,
      status,
      priority,
      ownerId,
      leadId,
      contactId,
      opportunityId,
      dueDateFrom,
      dueDateTo,
      overdue,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const baseWhere: any = {};

    if (search) {
      baseWhere.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status.length > 0) {
      baseWhere.status = { in: status };
    }

    if (priority && priority.length > 0) {
      baseWhere.priority = { in: priority };
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (leadId) {
      baseWhere.leadId = leadId;
    }

    if (contactId) {
      baseWhere.contactId = contactId;
    }

    if (opportunityId) {
      baseWhere.opportunityId = opportunityId;
    }

    if (dueDateFrom || dueDateTo) {
      baseWhere.dueDate = {};
      if (dueDateFrom) baseWhere.dueDate.gte = dueDateFrom;
      if (dueDateTo) baseWhere.dueDate.lte = dueDateTo;
    }

    if (overdue) {
      baseWhere.dueDate = { lt: new Date() };
      baseWhere.status = { notIn: ['COMPLETED', 'CANCELLED'] };
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel
    const [tasks, total] = await Promise.all([
      typedCtx.prismaWithTenant.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          lead: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          opportunity: {
            select: {
              id: true,
              name: true,
              stage: true,
            },
          },
        },
      }),
      typedCtx.prismaWithTenant.task.count({ where }),
    ]);

    return {
      tasks,
      total,
      page,
      limit,
      hasMore: skip + tasks.length < total,
    };
  }),

  /**
   * Update a task
   * Uses TaskService for title/description updates
   * Uses Prisma for complex multi-field updates (CQRS pattern)
   */
  update: tenantProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const { id, title, description, leadId, contactId, opportunityId, ...otherData } = input;

    // First check if task exists via service
    const getResult = await taskService.getTaskById(id);
    if (getResult.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: getResult.error.message,
      });
    }

    // If only title/description, use service
    if ((title !== undefined || description !== undefined) &&
        leadId === undefined && contactId === undefined && opportunityId === undefined &&
        Object.keys(otherData).length === 0) {
      const result = await taskService.updateTaskInfo(id, { title, description });
      if (result.isFailure) {
        const errorCode = result.error.code;
        if (errorCode === 'VALIDATION_ERROR') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }
      return mapTaskToResponse(result.value);
    }

    // For complex updates with entity assignments, validate then use Prisma (CQRS read-side)
    if (leadId !== undefined && leadId !== null) {
      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: leadId },
      });
      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${leadId} not found`,
        });
      }
    }

    if (contactId !== undefined && contactId !== null) {
      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: contactId },
      });
      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${contactId} not found`,
        });
      }
    }

    if (opportunityId !== undefined && opportunityId !== null) {
      const opportunity = await typedCtx.prismaWithTenant.opportunity.findUnique({
        where: { id: opportunityId },
      });
      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Opportunity with ID ${opportunityId} not found`,
        });
      }
    }

    // Complex update via Prisma
    const task = await typedCtx.prismaWithTenant.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...otherData,
        ...(leadId !== undefined && { leadId }),
        ...(contactId !== undefined && { contactId }),
        ...(opportunityId !== undefined && { opportunityId }),
      },
    });

    return task;
  }),

  /**
   * Delete a task
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);

    const result = await taskService.deleteTask(input.id);

    if (result.isFailure) {
      const errorCode = result.error.code;
      const message = result.error.message;
      if (errorCode === 'NOT_FOUND_ERROR' || message.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message,
        });
      }
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message,
      });
    }

    return { success: true, id: input.id };
  }),

  /**
   * Complete a task
   */
  complete: tenantProcedure.input(completeTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);

    const result = await taskService.completeTask(input.taskId, typedCtx.tenant.userId);

    if (result.isFailure) {
      const errorCode = result.error.code;
      const message = result.error.message;
      if (errorCode === 'NOT_FOUND_ERROR' || message.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message,
        });
      }
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message,
      });
    }

    return mapTaskToResponse(result.value);
  }),

  /**
   * Get task statistics
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const [total, byStatus, byPriority, overdue, dueToday] = await Promise.all([
      typedCtx.prismaWithTenant.task.count(),
      typedCtx.prismaWithTenant.task.groupBy({
        by: ['status'],
        _count: true,
      }),
      typedCtx.prismaWithTenant.task.groupBy({
        by: ['priority'],
        _count: true,
      }),
      typedCtx.prismaWithTenant.task.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      typedCtx.prismaWithTenant.task.count({
        where: {
          dueDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      overdue,
      dueToday,
    };
  }),
});
