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
  assignTaskSchema,
  rescheduleTaskSchema,
  getRemindersSchema,
  getByEntitySchema,
  idSchema,
} from '@intelliflow/validators/task';
import { mapTaskToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext,
} from '../../security/tenant-context';
import {
  TaskNotInProgressError,
  TaskAlreadyCompletedError,
  TaskAlreadyCancelledError,
  TaskCannotBeArchivedError,
  canTransitionTaskTo,
  type TaskStatus,
} from '@intelliflow/domain';
import { createNotification } from '../notifications/notifications.router';
import { getAuditLogger } from '../../security/audit-logger';
import { RBACService } from '../../security/rbac';
import type { RoleName } from '../../security/types';

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

/**
 * Map task create/update service failure to TRPCError
 */
function throwCreateTaskError(errorCode: string, message: string): never {
  if (errorCode === 'VALIDATION_ERROR') {
    const isEntityNotFound =
      message.includes('not found') ||
      message.includes('Lead') ||
      message.includes('Contact') ||
      message.includes('Opportunity');
    throw new TRPCError({
      code: isEntityNotFound ? 'NOT_FOUND' : 'BAD_REQUEST',
      message,
    });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * Validate that entity references (lead/contact/opportunity) exist in the tenant scope.
 * Throws NOT_FOUND TRPCError if any referenced entity is missing.
 */
async function validateEntityReferences(
  typedCtx: TenantAwareContext,
  refs: { leadId?: string | null; contactId?: string | null; opportunityId?: string | null }
): Promise<void> {
  if (refs.leadId !== undefined && refs.leadId !== null) {
    const lead = await typedCtx.prismaWithTenant.lead.findUnique({ where: { id: refs.leadId } });
    if (!lead) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Lead with ID ${refs.leadId} not found` });
    }
  }

  if (refs.contactId !== undefined && refs.contactId !== null) {
    const contact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: refs.contactId },
    });
    if (!contact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact with ID ${refs.contactId} not found`,
      });
    }
  }

  if (refs.opportunityId !== undefined && refs.opportunityId !== null) {
    const opportunity = await typedCtx.prismaWithTenant.opportunity.findUnique({
      where: { id: refs.opportunityId },
    });
    if (!opportunity) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Opportunity with ID ${refs.opportunityId} not found`,
      });
    }
  }
}

/**
 * Returns true when the update only modifies title/description (no entity reassignments).
 */
function isTextOnlyTaskUpdate(opts: {
  title?: unknown;
  description?: unknown;
  leadId?: unknown;
  contactId?: unknown;
  opportunityId?: unknown;
  otherData: Record<string, unknown>;
}): boolean {
  return (
    (opts.title !== undefined || opts.description !== undefined) &&
    opts.leadId === undefined &&
    opts.contactId === undefined &&
    opts.opportunityId === undefined &&
    Object.keys(opts.otherData).length === 0
  );
}

/**
 * Throw appropriate TRPCError for task update service failures.
 */
function throwTaskUpdateInfoError(errorCode: string, message: string): never {
  if (errorCode === 'VALIDATION_ERROR') {
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

function buildTaskListWhere(filters: {
  search?: string;
  status?: string[];
  priority?: string[];
  ownerId?: string;
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  overdue?: boolean;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const { search, status, priority, ownerId, leadId, contactId, opportunityId,
    dueDateFrom, dueDateTo, overdue } = filters;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (status && status.length > 0) where.status = { in: status };
  if (priority && priority.length > 0) where.priority = { in: priority };
  if (ownerId) where.ownerId = ownerId;
  if (leadId) where.leadId = leadId;
  if (contactId) where.contactId = contactId;
  if (opportunityId) where.opportunityId = opportunityId;
  if (overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
  } else if (dueDateFrom || dueDateTo) {
    const dueDate: Record<string, Date> = {};
    if (dueDateFrom) dueDate.gte = dueDateFrom;
    if (dueDateTo) dueDate.lte = dueDateTo;
    where.dueDate = dueDate;
  }
  return where;
}

export const taskRouter = createTRPCRouter({
  /**
   * Create a new task
   */
  create: tenantProcedure.input(createTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const rbac = new RBACService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // RBAC check
    const canWrite = await rbac.can({
      userId: typedCtx.tenant.userId,
      userRole: typedCtx.tenant.role as RoleName,
      resourceType: 'task',
      action: 'write',
    });
    if (!canWrite.granted) {
      await auditLogger.logPermissionDenied('task', '', 'task:write', typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: canWrite.reason ?? 'Insufficient permissions' });
    }

    const { calendarId, ...taskInput } = input;

    const result = await taskService.createTask({
      ...taskInput,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      throwCreateTaskError(result.error.code, result.error.message);
    }

    // Set calendarId if provided (not part of domain model)
    if (calendarId) {
      await typedCtx.prismaWithTenant.task.update({
        where: { id: result.value.id.toString() },
        data: { calendarId },
      });
    }

    // Audit log
    auditLogger.logAction('CREATE', 'task', result.value.id.toString(), typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: result.value.title,
    }).catch(() => {}); // Non-blocking

    // Fire-and-forget: notification failure must not block the task creation response
    createNotification(ctx.prisma, {
      userId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'task_assigned',
      title: 'New task created',
      body: `Task "${result.value.title}" has been created`,
      priority: 'normal',
      entityType: 'task',
      entityId: result.value.id.toString(),
      entityName: result.value.title,
      actionUrl: `/tasks/${result.value.id.toString()}`,
    }).catch(() => {}); // Swallow notification errors — non-critical side-effect

    return mapTaskToResponse(result.value);
  }),

  /**
   * Get a single task by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const where = createTenantWhereClause(typedCtx.tenant, { id: input.id });
    const task = await typedCtx.prismaWithTenant.task.findFirst({
      where,
      include: {
        owner: { select: { id: true, email: true, name: true } },
        lead: { select: { id: true, email: true, firstName: true, lastName: true } },
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
      },
    });

    if (!task) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Task not found',
      });
    }

    return task;
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
    const baseWhere = buildTaskListWhere({
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
    });

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
    const rbac = new RBACService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);
    const { id, title, description, leadId, contactId, opportunityId, ...otherData } = input;

    // RBAC check
    const canWrite = await rbac.can({
      userId: typedCtx.tenant.userId,
      userRole: typedCtx.tenant.role as RoleName,
      resourceType: 'task',
      action: 'write',
    });
    if (!canWrite.granted) {
      await auditLogger.logPermissionDenied('task', id, 'task:write', typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: canWrite.reason ?? 'Insufficient permissions' });
    }

    // First check if task exists via service
    const getResult = await taskService.getTaskById(id);
    if (getResult.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: getResult.error.message,
      });
    }

    // Validate status transitions through domain state machine (B-06)
    if (otherData.status && otherData.status !== getResult.value.status) {
      const currentStatus = getResult.value.status as TaskStatus;
      const newStatus = otherData.status as TaskStatus;
      if (!canTransitionTaskTo(currentStatus, newStatus)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot transition task from ${currentStatus} to ${newStatus}`,
        });
      }
    }

    // If only title/description, use service
    if (isTextOnlyTaskUpdate({ title, description, leadId, contactId, opportunityId, otherData })) {
      const result = await taskService.updateTaskInfo(id, { title, description });
      if (result.isFailure) {
        throwTaskUpdateInfoError(result.error.code, result.error.message);
      }

      auditLogger.logAction('UPDATE', 'task', id, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        resourceName: result.value.title,
      }).catch(() => {});

      return mapTaskToResponse(result.value);
    }

    // For complex updates with entity assignments, validate then use Prisma (CQRS read-side)
    await validateEntityReferences(typedCtx, { leadId, contactId, opportunityId });

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

    auditLogger.logAction('UPDATE', 'task', id, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: task.title,
    }).catch(() => {});

    return task;
  }),

  /**
   * Delete a task
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const rbac = new RBACService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // RBAC check
    const canDelete = await rbac.can({
      userId: typedCtx.tenant.userId,
      userRole: typedCtx.tenant.role as RoleName,
      resourceType: 'task',
      action: 'delete',
    });
    if (!canDelete.granted) {
      await auditLogger.logPermissionDenied('task', input.id, 'task:delete', typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: canDelete.reason ?? 'Insufficient permissions' });
    }

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

    auditLogger.logAction('DELETE', 'task', input.id, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
    }).catch(() => {});

    return { success: true, id: input.id };
  }),

  /**
   * Archive a completed or cancelled task
   */
  archive: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const auditLogger = getAuditLogger(ctx.prisma);

    const result = await taskService.archiveTask(input.id);

    if (result.isFailure) {
      const errorCode = result.error.code;
      const message = result.error.message;
      if (errorCode === 'NOT_FOUND_ERROR' || message.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message,
        });
      }
      // TaskCannotBeArchivedError or VALIDATION_ERROR → PRECONDITION_FAILED
      if (
        result.error instanceof TaskCannotBeArchivedError ||
        errorCode === 'TASK_CANNOT_BE_ARCHIVED' ||
        errorCode === 'VALIDATION_ERROR'
      ) {
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

    auditLogger.logAction('UPDATE', 'task', input.id, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: 'task archived',
    }).catch(() => {});

    return { success: true, id: input.id };
  }),

  /**
   * Complete a task
   */
  complete: tenantProcedure.input(completeTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const auditLogger = getAuditLogger(ctx.prisma);

    const result = await taskService.completeTask(input.taskId, typedCtx.tenant.userId);

    if (result.isFailure) {
      const errorCode = result.error.code;
      const message = result.error.message;

      // Handle specific domain errors
      if (
        result.error instanceof TaskNotInProgressError ||
        result.error instanceof TaskAlreadyCompletedError ||
        result.error instanceof TaskAlreadyCancelledError
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message,
        });
      }

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

    auditLogger.logAction('UPDATE', 'task', input.taskId, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: result.value.title,
    }).catch(() => {});

    // Fire-and-forget: notification failure must not block the task completion response
    createNotification(ctx.prisma, {
      userId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'task_completed',
      title: 'Task completed',
      body: `Task "${result.value.title}" has been completed`,
      priority: 'normal',
      entityType: 'task',
      entityId: result.value.id.toString(),
      entityName: result.value.title,
      actionUrl: `/tasks/${result.value.id.toString()}`,
    }).catch(() => {}); // Swallow notification errors — non-critical side-effect

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
      total: total ?? 0,
      byStatus: (byStatus ?? []).reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byPriority: (byPriority ?? []).reduce(
        (acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      overdue: overdue ?? 0,
      dueToday: dueToday ?? 0,
    };
  }),

  /**
   * Assign a task to a CRM entity (lead, contact, or opportunity)
   */
  assign: tenantProcedure.input(assignTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const auditLogger = getAuditLogger(ctx.prisma);

    let result;
    switch (input.entityType) {
      case 'lead':
        result = await taskService.assignToLead(
          input.taskId,
          input.entityId,
          typedCtx.tenant.userId
        );
        break;
      case 'contact':
        result = await taskService.assignToContact(
          input.taskId,
          input.entityId,
          typedCtx.tenant.userId
        );
        break;
      case 'opportunity':
        result = await taskService.assignToOpportunity(
          input.taskId,
          input.entityId,
          typedCtx.tenant.userId
        );
        break;
    }

    if (result.isFailure) {
      const message = result.error.message;
      if (message.includes('not found')) {
        throw new TRPCError({ code: 'NOT_FOUND', message });
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message });
    }

    auditLogger.logAction('UPDATE', 'task', result.value.id.toString(), typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: result.value.title,
    }).catch(() => {});

    // Fire-and-forget: notification failure must not block the task assignment response
    createNotification(ctx.prisma, {
      userId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'task_assigned',
      title: 'Task assigned to entity',
      body: `Task "${result.value.title}" assigned to ${input.entityType}`,
      priority: 'normal',
      entityType: 'task',
      entityId: result.value.id.toString(),
      entityName: result.value.title,
      actionUrl: `/tasks/${result.value.id.toString()}`,
    }).catch(() => {}); // Swallow notification errors — non-critical side-effect

    return mapTaskToResponse(result.value);
  }),

  /**
   * Reschedule a task (update due date)
   */
  reschedule: tenantProcedure.input(rescheduleTaskSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);
    const auditLogger = getAuditLogger(ctx.prisma);

    const result = await taskService.updateDueDate(
      input.taskId,
      input.newDueDate,
      typedCtx.tenant.userId
    );

    if (result.isFailure) {
      const message = result.error.message;
      if (message.includes('not found')) {
        throw new TRPCError({ code: 'NOT_FOUND', message });
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message });
    }

    auditLogger.logAction('UPDATE', 'task', input.taskId, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: result.value.title,
    }).catch(() => {});

    return mapTaskToResponse(result.value);
  }),

  /**
   * Get tasks needing attention (overdue + due soon)
   */
  getReminders: tenantProcedure.input(getRemindersSchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const taskService = getTaskService(ctx);

    const ownerId = input?.ownerId ?? typedCtx.tenant.userId;

    const [overdue, dueSoon] = await Promise.all([
      taskService.getOverdueTasks(ownerId),
      taskService.getTasksDueSoon(ownerId),
    ]);

    return {
      overdue: overdue.map(mapTaskToResponse),
      dueSoon: dueSoon.map(mapTaskToResponse),
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
    };
  }),

  /**
   * Get tasks linked to a specific CRM entity
   */
  getByEntity: tenantProcedure.input(getByEntitySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    let entityFilter: { leadId: string } | { contactId: string } | { opportunityId: string };
    if (input.entityType === 'lead') {
      entityFilter = { leadId: input.entityId };
    } else if (input.entityType === 'contact') {
      entityFilter = { contactId: input.entityId };
    } else {
      entityFilter = { opportunityId: input.entityId };
    }

    const where = createTenantWhereClause(typedCtx.tenant, entityFilter);
    const tasks = await typedCtx.prismaWithTenant.task.findMany({
      where,
      include: {
        owner: { select: { id: true, email: true, name: true } },
        lead: { select: { id: true, email: true, firstName: true, lastName: true } },
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tasks;
  }),
});
