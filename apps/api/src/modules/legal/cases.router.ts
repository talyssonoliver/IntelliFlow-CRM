/**
 * Cases Router — PG-138
 *
 * Provides type-safe tRPC endpoints for legal case management:
 * - CRUD operations (create, read, update, close)
 * - List with filtering, search, and pagination
 * - Case statistics for dashboard
 * - Case task management (add, complete, remove)
 * - Filter options and assignee listing
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createCaseSchema,
  updateCaseSchema,
  caseQuerySchema,
  changeCaseStatusSchema,
  closeCaseSchema,
  addCaseTaskSchema,
  completeCaseTaskSchema,
  removeCaseTaskSchema,
  idSchema,
} from '@intelliflow/validators/case';
import { assertTenantContext } from '../../security/tenant-context';
import { createNotification } from '../notifications/notifications.router';

function getAssigneeTitle(role?: string | null): string {
  switch (role) {
    case 'ADMIN':
      return 'Legal Admin';
    case 'MANAGER':
      return 'Case Manager';
    case 'SALES_REP':
      return 'Legal Associate';
    case 'USER':
    default:
      return 'Legal Staff';
  }
}

export const casesRouter = createTRPCRouter({
  /**
   * List cases with filtering and pagination
   */
  list: tenantProcedure.input(caseQuerySchema).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const {
      page = 1,
      limit = 20,
      search,
      status,
      priority,
      clientId,
      assignedTo,
      deadlineFrom,
      deadlineTo,
      overdue,
    } = input;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };

    if (status?.length) {
      where.status = { in: status };
    }

    if (priority?.length) {
      where.priority = { in: priority };
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (assignedTo) {
      where.assignedTo = assignedTo;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (deadlineFrom || deadlineTo) {
      where.deadline = {
        ...(deadlineFrom ? { gte: deadlineFrom } : {}),
        ...(deadlineTo ? { lte: deadlineTo } : {}),
      };
    }

    if (overdue) {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['CLOSED', 'CANCELLED'] };
    }

    const [cases, total] = await Promise.all([
      ctx.prisma.case.findMany({
        where,
        include: {
          tasks: { orderBy: { dueDate: 'asc' } },
          client: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      ctx.prisma.case.count({ where }),
    ]);

    const now = new Date();

    return {
      cases: cases.map((c: Record<string, unknown>) => {
        const tasks = c.tasks as Array<{
          status: string;
          dueDate: Date | null;
          completedAt: Date | null;
          id: string;
          title: string;
          description: string | null;
          assignee: string | null;
          caseId: string;
          createdAt: Date;
          updatedAt: Date;
        }>;
        const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
        const totalTasks = tasks.length;
        const deadline = c.deadline as Date | null;
        const status = c.status as string;
        const isOverdue =
          deadline !== null && deadline < now && status !== 'CLOSED' && status !== 'CANCELLED';

        return {
          id: c.id,
          title: c.title,
          description: c.description,
          status: c.status,
          priority: c.priority,
          deadline: c.deadline,
          clientId: c.clientId,
          assignedTo: c.assignedTo,
          client: c.client,
          assignee: c.assignee,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            dueDate: t.dueDate,
            status: t.status,
            assignee: t.assignee,
            isOverdue:
              t.dueDate !== null &&
              t.dueDate < now &&
              t.status !== 'COMPLETED' &&
              t.status !== 'CANCELLED',
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            completedAt: t.completedAt,
          })),
          taskProgress: totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100),
          pendingTaskCount: totalTasks - completedCount,
          completedTaskCount: completedCount,
          isOverdue,
          resolution: c.resolution,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          closedAt: c.closedAt,
        };
      }),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }),

  /**
   * Get a single case by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const caseData = await ctx.prisma.case.findFirst({
      where: { id: input.id, tenantId },
      include: {
        tasks: { orderBy: { dueDate: 'asc' } },
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
        appointments: {
          include: {
            appointment: {
              select: { id: true, title: true, startTime: true, endTime: true, status: true },
            },
          },
        },
      },
    });

    if (!caseData) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    const now = new Date();
    const tasks = caseData.tasks as Array<{
      status: string;
      dueDate: Date | null;
      completedAt: Date | null;
      id: string;
      title: string;
      description: string | null;
      assignee: string | null;
      caseId: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
    const totalTasks = tasks.length;

    return {
      id: caseData.id,
      title: caseData.title,
      description: caseData.description,
      status: caseData.status,
      priority: caseData.priority,
      deadline: caseData.deadline,
      clientId: caseData.clientId,
      assignedTo: caseData.assignedTo,
      parties: caseData.parties,
      client: caseData.client,
      assignee: caseData.assignee,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        status: t.status,
        assignee: t.assignee,
        isOverdue:
          t.dueDate !== null &&
          t.dueDate < now &&
          t.status !== 'COMPLETED' &&
          t.status !== 'CANCELLED',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        completedAt: t.completedAt,
      })),
      taskProgress: totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100),
      pendingTaskCount: totalTasks - completedCount,
      completedTaskCount: completedCount,
      isOverdue:
        caseData.deadline !== null &&
        caseData.deadline < now &&
        caseData.status !== 'CLOSED' &&
        caseData.status !== 'CANCELLED',
      resolution: caseData.resolution,
      appointments: caseData.appointments.map(
        (a: Record<string, unknown>) => (a as { appointment: unknown }).appointment
      ),
      createdAt: caseData.createdAt,
      updatedAt: caseData.updatedAt,
      closedAt: caseData.closedAt,
    };
  }),

  /**
   * Get case statistics
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [statusCounts, priorityCounts, overdueCount, closedThisMonth, allCases] =
      await Promise.all([
        ctx.prisma.case.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        ctx.prisma.case.groupBy({
          by: ['priority'],
          where: { tenantId },
          _count: true,
        }),
        ctx.prisma.case.count({
          where: {
            tenantId,
            deadline: { lt: now },
            status: { notIn: ['CLOSED', 'CANCELLED'] },
          },
        }),
        ctx.prisma.case.count({
          where: {
            tenantId,
            status: 'CLOSED',
            closedAt: { gte: startOfMonth },
          },
        }),
        ctx.prisma.case.count({ where: { tenantId } }),
      ]);

    const byStatus: Record<string, number> = {};
    for (const s of statusCounts) {
      byStatus[s.status] = s._count;
    }

    const byPriority: Record<string, number> = {};
    for (const p of priorityCounts) {
      byPriority[p.priority] = p._count;
    }

    return {
      total: allCases,
      byStatus,
      byPriority,
      overdue: overdueCount,
      closedThisMonth,
      averageTaskCompletion: 0,
    };
  }),

  /**
   * Create a new case
   */
  create: tenantProcedure.input(createCaseSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const userId = (ctx.user as { id?: string })?.id;
    const assignedTo = input.assignedTo ?? userId;

    if (!assignedTo) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Assignee is required' });
    }

    const caseData = await ctx.prisma.case.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        deadline: input.deadline,
        clientId: input.clientId,
        assignedTo,
        tenantId,
      },
      include: {
        tasks: true,
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Notify assignee
    if (assignedTo) {
      createNotification(ctx.prisma, {
        userId: assignedTo,
        tenantId,
        type: 'case_assigned',
        title: 'Case assigned to you',
        body: `Case "${input.title}" has been assigned to you`,
        priority: 'normal',
        entityType: 'case',
        entityId: caseData.id,
        entityName: input.title,
        actionUrl: `/cases/${caseData.id}`,
      }).catch(() => {});
    }

    return caseData;
  }),

  /**
   * Update a case
   */
  update: tenantProcedure.input(updateCaseSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const existing = await ctx.prisma.case.findFirst({
      where: { id: input.id, tenantId },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    const { id, ...updateData } = input;

    const caseData = await ctx.prisma.case.update({
      where: { id },
      data: updateData,
      include: {
        tasks: true,
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return caseData;
  }),

  /**
   * Change case status
   */
  changeStatus: tenantProcedure.input(changeCaseStatusSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const existing = await ctx.prisma.case.findFirst({
      where: { id: input.caseId, tenantId },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    const validTransitions: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'],
      IN_PROGRESS: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
      ON_HOLD: ['IN_PROGRESS', 'CLOSED', 'CANCELLED'],
      CLOSED: [],
      CANCELLED: [],
    };

    if (!validTransitions[existing.status]?.includes(input.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot transition from ${existing.status} to ${input.status}`,
      });
    }

    const data: Record<string, unknown> = { status: input.status };
    if (input.status === 'CLOSED') {
      data.closedAt = new Date();
    }

    const caseData = await ctx.prisma.case.update({
      where: { id: input.caseId },
      data,
    });

    // Notify on status change
    createNotification(ctx.prisma, {
      userId: existing.assignedTo || ctx.user!.id as string,
      tenantId,
      type: 'case_status_changed',
      title: 'Case status changed',
      body: `Case "${existing.title}" status changed to ${input.status}`,
      priority: 'normal',
      entityType: 'case',
      entityId: caseData.id,
      entityName: existing.title,
      actionUrl: `/cases/${caseData.id}`,
    }).catch(() => {});

    return caseData;
  }),

  /**
   * Close a case with resolution
   */
  close: tenantProcedure.input(closeCaseSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const existing = await ctx.prisma.case.findFirst({
      where: { id: input.caseId, tenantId },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Case is already closed or cancelled' });
    }

    const caseData = await ctx.prisma.case.update({
      where: { id: input.caseId },
      data: {
        status: 'CLOSED',
        resolution: input.resolution,
        closedAt: new Date(),
      },
    });

    // Notify on case closure
    createNotification(ctx.prisma, {
      userId: existing.assignedTo || ctx.user!.id as string,
      tenantId,
      type: 'case_closed',
      title: 'Case closed',
      body: `Case "${existing.title}" has been closed`,
      priority: 'normal',
      entityType: 'case',
      entityId: caseData.id,
      entityName: existing.title,
      actionUrl: `/cases/${caseData.id}`,
    }).catch(() => {});

    return caseData;
  }),

  /**
   * Add a task to a case
   */
  addTask: tenantProcedure.input(addCaseTaskSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const existing = await ctx.prisma.case.findFirst({
      where: { id: input.caseId, tenantId },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot add tasks to a closed or cancelled case',
      });
    }

    const task = await ctx.prisma.caseTask.create({
      data: {
        caseId: input.caseId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        assignee: input.assignee,
        tenantId,
      },
    });

    return task;
  }),

  /**
   * Complete a case task
   */
  completeTask: tenantProcedure.input(completeCaseTaskSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const caseData = await ctx.prisma.case.findFirst({
      where: { id: input.caseId, tenantId },
    });

    if (!caseData) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    const task = await ctx.prisma.caseTask.findFirst({
      where: { id: input.taskId, caseId: input.caseId },
    });

    if (!task) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    }

    const updated = await ctx.prisma.caseTask.update({
      where: { id: input.taskId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    return updated;
  }),

  /**
   * Remove a case task
   */
  removeTask: tenantProcedure.input(removeCaseTaskSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const caseData = await ctx.prisma.case.findFirst({
      where: { id: input.caseId, tenantId },
    });

    if (!caseData) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    await ctx.prisma.caseTask.delete({
      where: { id: input.taskId },
    });

    return { success: true };
  }),

  /**
   * Get filter options with counts
   */
  filterOptions: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

    const [statusCounts, priorityCounts] = await Promise.all([
      ctx.prisma.case.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      ctx.prisma.case.groupBy({
        by: ['priority'],
        where: { tenantId },
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
    };
  }),

  /**
   * Team assignees for case assignment
   */
  assignees: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.user!.tenantId;

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
});

export type CasesRouter = typeof casesRouter;
