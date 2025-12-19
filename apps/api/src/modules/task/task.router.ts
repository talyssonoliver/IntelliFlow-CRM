/**
 * Task Router
 *
 * Provides type-safe tRPC endpoints for task management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Task completion and tracking
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../server';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  completeTaskSchema,
  idSchema,
} from '@intelliflow/validators/task';

export const taskRouter = router({
  /**
   * Create a new task
   */
  create: protectedProcedure.input(createTaskSchema).mutation(async ({ ctx, input }) => {
    // Validate related entities if provided
    if (input.leadId) {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
      });
      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${input.leadId} not found`,
        });
      }
    }

    if (input.contactId) {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.contactId} not found`,
        });
      }
    }

    if (input.opportunityId) {
      const opportunity = await ctx.prisma.opportunity.findUnique({
        where: { id: input.opportunityId },
      });
      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Opportunity with ID ${input.opportunityId} not found`,
        });
      }
    }

    const task = await ctx.prisma.task.create({
      data: {
        ...input,
        ownerId: ctx.user.userId,
      },
    });

    return task;
  }),

  /**
   * Get a single task by ID
   */
  getById: protectedProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const task = await ctx.prisma.task.findUnique({
      where: { id: input.id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
        lead: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
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
            value: true,
            stage: true,
          },
        },
      },
    });

    if (!task) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Task with ID ${input.id} not found`,
      });
    }

    return task;
  }),

  /**
   * List tasks with filtering and pagination
   */
  list: protectedProcedure.input(taskQuerySchema).query(async ({ ctx, input }) => {
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

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (priority && priority.length > 0) {
      where.priority = { in: priority };
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (leadId) {
      where.leadId = leadId;
    }

    if (contactId) {
      where.contactId = contactId;
    }

    if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate.gte = dueDateFrom;
      if (dueDateTo) where.dueDate.lte = dueDateTo;
    }

    if (overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
    }

    // Execute queries in parallel
    const [tasks, total] = await Promise.all([
      ctx.prisma.task.findMany({
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
      ctx.prisma.task.count({ where }),
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
   */
  update: protectedProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const { id, leadId, contactId, opportunityId, ...data } = input;

    // Check if task exists
    const existingTask = await ctx.prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Task with ID ${id} not found`,
      });
    }

    // Validate related entities if provided
    if (leadId !== undefined && leadId !== null) {
      const lead = await ctx.prisma.lead.findUnique({
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
      const contact = await ctx.prisma.contact.findUnique({
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
      const opportunity = await ctx.prisma.opportunity.findUnique({
        where: { id: opportunityId },
      });
      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Opportunity with ID ${opportunityId} not found`,
        });
      }
    }

    // Update the task
    const task = await ctx.prisma.task.update({
      where: { id },
      data: {
        ...data,
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
  delete: protectedProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    // Check if task exists
    const existingTask = await ctx.prisma.task.findUnique({
      where: { id: input.id },
    });

    if (!existingTask) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Task with ID ${input.id} not found`,
      });
    }

    // Delete the task
    await ctx.prisma.task.delete({
      where: { id: input.id },
    });

    return { success: true, id: input.id };
  }),

  /**
   * Complete a task
   */
  complete: protectedProcedure.input(completeTaskSchema).mutation(async ({ ctx, input }) => {
    const task = await ctx.prisma.task.findUnique({
      where: { id: input.taskId },
    });

    if (!task) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Task with ID ${input.taskId} not found`,
      });
    }

    if (task.status === 'COMPLETED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Task is already completed',
      });
    }

    // Update task to completed
    const updatedTask = await ctx.prisma.task.update({
      where: { id: input.taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return updatedTask;
  }),

  /**
   * Get task statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byStatus, byPriority, overdue, dueToday] = await Promise.all([
      ctx.prisma.task.count(),
      ctx.prisma.task.groupBy({
        by: ['status'],
        _count: true,
      }),
      ctx.prisma.task.groupBy({
        by: ['priority'],
        _count: true,
      }),
      ctx.prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      ctx.prisma.task.count({
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
