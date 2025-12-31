/**
 * Opportunity Router
 *
 * Provides type-safe tRPC endpoints for opportunity/deal management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Stage progression and pipeline analytics
 *
 * Following hexagonal architecture - uses OpportunityService for business logic.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  opportunityQuerySchema,
  idSchema,
} from '@intelliflow/validators/opportunity';
import { mapOpportunityToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Helper to get opportunity service from context
 */
function getOpportunityService(ctx: Context) {
  if (!ctx.services?.opportunity) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Opportunity service not available',
    });
  }
  return ctx.services.opportunity;
}

export const opportunityRouter = createTRPCRouter({
  /**
   * Create a new opportunity
   */
  create: tenantProcedure.input(createOpportunitySchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const opportunityService = getOpportunityService(ctx);

    const result = await opportunityService.createOpportunity({
      ...input,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'VALIDATION_ERROR' || errorCode === 'NOT_FOUND_ERROR') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * Get a single opportunity by ID
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const opportunityService = getOpportunityService(ctx);

    const result = await opportunityService.getOpportunityById(input.id);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * List opportunities with filtering and pagination
   */
  list: tenantProcedure.input(opportunityQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const {
      page = 1,
      limit = 20,
      search,
      stage,
      ownerId,
      accountId,
      contactId,
      minValue,
      maxValue,
      minProbability,
      maxProbability,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const baseWhere: any = {};

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (stage && stage.length > 0) {
      baseWhere.stage = { in: stage };
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (accountId) {
      baseWhere.accountId = accountId;
    }

    if (contactId) {
      baseWhere.contactId = contactId;
    }

    if (minValue !== undefined || maxValue !== undefined) {
      baseWhere.value = {};
      if (minValue !== undefined) baseWhere.value.gte = minValue;
      if (maxValue !== undefined) baseWhere.value.lte = maxValue;
    }

    if (minProbability !== undefined || maxProbability !== undefined) {
      baseWhere.probability = {};
      if (minProbability !== undefined) baseWhere.probability.gte = minProbability;
      if (maxProbability !== undefined) baseWhere.probability.lte = maxProbability;
    }

    if (dateFrom || dateTo) {
      baseWhere.expectedCloseDate = {};
      if (dateFrom) baseWhere.expectedCloseDate.gte = dateFrom;
      if (dateTo) baseWhere.expectedCloseDate.lte = dateTo;
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel
    const [opportunities, total] = await Promise.all([
      typedCtx.prismaWithTenant.opportunity.findMany({
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
          account: {
            select: {
              id: true,
              name: true,
              industry: true,
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
        },
      }),
      typedCtx.prismaWithTenant.opportunity.count({ where }),
    ]);

    return {
      opportunities,
      total,
      page,
      limit,
      hasMore: skip + opportunities.length < total,
    };
  }),

  /**
   * Update an opportunity
   */
  update: tenantProcedure.input(updateOpportunitySchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const opportunityService = getOpportunityService(ctx);

    const { id, ...data } = input;

    const result = await opportunityService.updateOpportunity(
      id,
      {
        ...data,
        value: data.value?.amount,
        probability: data.probability?.value,
      },
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
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * Delete an opportunity
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const opportunityService = getOpportunityService(ctx);

    const result = await opportunityService.deleteOpportunity(input.id);

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'NOT_FOUND_ERROR' || errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: errorCode === 'NOT_FOUND_ERROR' ? 'NOT_FOUND' : 'PRECONDITION_FAILED',
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
   * Get opportunity statistics and pipeline analytics
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const [total, byStage, totalValue, avgProbability] = await Promise.all([
      typedCtx.prismaWithTenant.opportunity.count(),
      typedCtx.prismaWithTenant.opportunity.groupBy({
        by: ['stage'],
        _count: true,
        _sum: { value: true },
      }),
      typedCtx.prismaWithTenant.opportunity.aggregate({
        _sum: { value: true },
      }),
      typedCtx.prismaWithTenant.opportunity.aggregate({
        _avg: { probability: true },
      }),
    ]);

    return {
      total,
      byStage: byStage.reduce(
        (acc, item) => {
          acc[item.stage] = {
            count: item._count,
            totalValue: item._sum.value?.toString() || '0',
          };
          return acc;
        },
        {} as Record<string, { count: number; totalValue: string }>
      ),
      totalValue: totalValue._sum.value?.toString() || '0',
      averageProbability: avgProbability._avg.probability || 0,
    };
  }),

  /**
   * Get pipeline forecast
   */
  forecast: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const opportunities = await typedCtx.prismaWithTenant.opportunity.findMany({
      where: {
        stage: {
          notIn: ['CLOSED_WON', 'CLOSED_LOST'],
        },
      },
      select: {
        value: true,
        probability: true,
        stage: true,
      },
    });

    const weightedValue = opportunities.reduce((sum, opp) => {
      const value = Number(opp.value);
      const probability = opp.probability / 100;
      return sum + value * probability;
    }, 0);

    return {
      totalOpportunities: opportunities.length,
      weightedValue: weightedValue.toString(),
    };
  }),
});
