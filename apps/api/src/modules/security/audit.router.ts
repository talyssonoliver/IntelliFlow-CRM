/**
 * Audit Router
 *
 * Provides tRPC endpoints for querying and managing audit logs.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 *
 * Endpoints:
 * - search: Search audit logs with filters
 * - getByResource: Get audit trail for a specific resource
 * - getMyActivity: Get current user's activity log
 * - getSecurityEvents: Get security events (admin only)
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../../trpc';
import { TRPCError } from '@trpc/server';

// Input schemas
const searchAuditLogsSchema = z.object({
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

const getByResourceSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  limit: z.number().min(1).max(100).default(50),
});

const getSecurityEventsSchema = z.object({
  eventType: z.string().optional(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
});

export const auditRouter = createTRPCRouter({
  /**
   * Search audit logs with filters
   *
   * Requires: Manager or Admin role
   */
  search: protectedProcedure.input(searchAuditLogsSchema).query(async ({ ctx, input }) => {
    // Check if user has permission to view audit logs
    if (!['ADMIN', 'MANAGER'].includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Manager or Admin access required to view audit logs',
      });
    }

    const where: Record<string, unknown> = {};

    if (input.resourceType) {
      where.entityType = input.resourceType;
    }
    if (input.resourceId) {
      where.entityId = input.resourceId;
    }
    if (input.actorId) {
      where.userId = input.actorId;
    }
    if (input.action) {
      where.action = input.action;
    }
    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) {
        (where.createdAt as Record<string, Date>).gte = input.startDate;
      }
      if (input.endDate) {
        (where.createdAt as Record<string, Date>).lte = input.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      ctx.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      ctx.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      hasMore: input.offset + logs.length < total,
    };
  }),

  /**
   * Get audit trail for a specific resource
   *
   * Requires: Read access to the resource
   */
  getByResource: protectedProcedure.input(getByResourceSchema).query(async ({ ctx, input }) => {
    const logs = await ctx.prisma.auditLog.findMany({
      where: {
        entityType: input.resourceType,
        entityId: input.resourceId,
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return logs;
  }),

  /**
   * Get current user's activity log
   */
  getMyActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const [logs, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where: {
            userId: ctx.user.userId,
          },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.auditLog.count({
          where: { userId: ctx.user.userId },
        }),
      ]);

      return {
        logs,
        total,
        hasMore: input.offset + logs.length < total,
      };
    }),

  /**
   * Get security events (admin only)
   */
  getSecurityEvents: adminProcedure.input(getSecurityEventsSchema).query(async ({ ctx, input }) => {
    // Note: SecurityEvent model would need to be added to Prisma schema
    // For now, return audit logs with security-related actions
    const securityActions = [
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'PASSWORD_RESET',
      'PERMISSION_DENIED',
    ];

    const where: Record<string, unknown> = {
      action: { in: securityActions },
    };

    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) {
        (where.createdAt as Record<string, Date>).gte = input.startDate;
      }
      if (input.endDate) {
        (where.createdAt as Record<string, Date>).lte = input.endDate;
      }
    }

    const logs = await ctx.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return logs;
  }),

  /**
   * Get audit statistics (admin only)
   */
  getStats: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {};

      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          (where.createdAt as Record<string, Date>).gte = input.startDate;
        }
        if (input.endDate) {
          (where.createdAt as Record<string, Date>).lte = input.endDate;
        }
      }

      const [total, byAction, byResource, byUser] = await Promise.all([
        ctx.prisma.auditLog.count({ where }),
        ctx.prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: true,
        }),
        ctx.prisma.auditLog.groupBy({
          by: ['entityType'],
          where,
          _count: true,
        }),
        ctx.prisma.auditLog.groupBy({
          by: ['userId'],
          where,
          _count: true,
          orderBy: {
            _count: {
              userId: 'desc',
            },
          },
          take: 10,
        }),
      ]);

      return {
        total,
        byAction: byAction.reduce(
          (acc, item) => {
            acc[item.action] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        byResource: byResource.reduce(
          (acc, item) => {
            acc[item.entityType] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        topUsers: byUser.map((item) => ({
          userId: item.userId,
          count: item._count,
        })),
      };
    }),
});
