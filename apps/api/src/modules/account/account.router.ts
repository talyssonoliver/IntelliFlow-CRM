/**
 * Account Router
 *
 * Provides type-safe tRPC endpoints for account management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Account statistics and insights
 *
 * Following hexagonal architecture - uses AccountService for business logic.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createAccountSchema,
  updateAccountSchema,
  accountQuerySchema,
  idSchema,
} from '@intelliflow/validators/account';
import { mapAccountToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Helper to get account service from context
 */
function getAccountService(ctx: Context) {
  if (!ctx.services?.account) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Account service not available',
    });
  }
  return ctx.services.account;
}

export const accountRouter = createTRPCRouter({
  /**
   * Create a new account
   */
  create: tenantProcedure.input(createAccountSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const result = await accountService.createAccount({
      ...input,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return mapAccountToResponse(result.value);
  }),

  /**
   * Get a single account by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const result = await accountService.getAccountById(input.id);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    return mapAccountToResponse(result.value);
  }),

  /**
   * List accounts with filtering and pagination
   * Uses Prisma for complex queries with joins for performance
   */
  list: tenantProcedure.input(accountQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const {
      page = 1,
      limit = 20,
      search,
      industry,
      ownerId,
      minRevenue,
      maxRevenue,
      minEmployees,
      maxEmployees,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const baseWhere: Record<string, unknown> = {};

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry) {
      baseWhere.industry = { contains: industry, mode: 'insensitive' };
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (minRevenue !== undefined || maxRevenue !== undefined) {
      baseWhere.revenue = {};
      if (minRevenue !== undefined) (baseWhere.revenue as Record<string, number>).gte = minRevenue;
      if (maxRevenue !== undefined) (baseWhere.revenue as Record<string, number>).lte = maxRevenue;
    }

    if (minEmployees !== undefined || maxEmployees !== undefined) {
      baseWhere.employees = {};
      if (minEmployees !== undefined) (baseWhere.employees as Record<string, number>).gte = minEmployees;
      if (maxEmployees !== undefined) (baseWhere.employees as Record<string, number>).lte = maxEmployees;
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel
    const [accounts, total] = await Promise.all([
      typedCtx.prismaWithTenant.account.findMany({
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
          _count: {
            select: {
              contacts: true,
              opportunities: true,
            },
          },
        },
      }),
      typedCtx.prismaWithTenant.account.count({ where }),
    ]);

    return {
      accounts,
      total,
      page,
      limit,
      hasMore: skip + accounts.length < total,
    };
  }),

  /**
   * Update an account
   */
  update: tenantProcedure.input(updateAccountSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const { id, ...data } = input;

    // Convert WebsiteUrl Value Object to string for service
    const updateData: {
      name?: string;
      website?: string;
      description?: string;
    } = {
      ...data,
      website: data.website?.toValue?.() ?? (data.website as string | undefined),
    };

    const result = await accountService.updateAccountInfo(
      id,
      updateData,
      typedCtx.tenant.userId
    );

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'NOT_FOUND_ERROR') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    return mapAccountToResponse(result.value);
  }),

  /**
   * Delete an account
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const result = await accountService.deleteAccount(input.id);

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'NOT_FOUND_ERROR' || errorCode === 'VALIDATION_ERROR') {
        const isNotFound = result.error.message.includes('not found');
        throw new TRPCError({
          code: isNotFound ? 'NOT_FOUND' : 'PRECONDITION_FAILED',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    return { success: true, id: input.id };
  }),

  /**
   * Get account statistics
   * Uses Prisma for aggregations (read-side CQRS pattern)
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const [total, byIndustry, withContacts, totalRevenue] = await Promise.all([
      typedCtx.prismaWithTenant.account.count(),
      typedCtx.prismaWithTenant.account.groupBy({
        by: ['industry'],
        _count: true,
        where: {
          industry: { not: null },
        },
      }),
      typedCtx.prismaWithTenant.account.count({
        where: {
          contacts: {
            some: {},
          },
        },
      }),
      typedCtx.prismaWithTenant.account.aggregate({
        _sum: { revenue: true },
      }),
    ]);

    return {
      total,
      byIndustry: byIndustry.reduce(
        (acc, item) => {
          if (item.industry) {
            acc[item.industry] = item._count;
          }
          return acc;
        },
        {} as Record<string, number>
      ),
      withContacts,
      withoutContacts: total - withContacts,
      totalRevenue: totalRevenue._sum.revenue?.toString() || '0',
    };
  }),
});
