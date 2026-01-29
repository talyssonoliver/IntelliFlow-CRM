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
   * Get pipeline forecast with full analytics
   * Returns: active deals, stage breakdown, win rates, projections
   */
  forecast: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);

    // Get active opportunities (not closed)
    const activeOpportunities = await typedCtx.prismaWithTenant.opportunity.findMany({
      where: {
        stage: {
          notIn: ['CLOSED_WON', 'CLOSED_LOST'],
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { value: 'desc' },
    });

    // Get closed deals for win rate calculation (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const closedDeals = await typedCtx.prismaWithTenant.opportunity.findMany({
      where: {
        stage: {
          in: ['CLOSED_WON', 'CLOSED_LOST'],
        },
        closedAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        id: true,
        value: true,
        stage: true,
        closedAt: true,
        createdAt: true,
      },
    });

    // Calculate weighted pipeline value
    const weightedValue = activeOpportunities.reduce((sum, opp) => {
      const value = Number(opp.value);
      const probability = opp.probability / 100;
      return sum + value * probability;
    }, 0);

    // Calculate total pipeline value
    const totalPipelineValue = activeOpportunities.reduce((sum, opp) => {
      return sum + Number(opp.value);
    }, 0);

    // Calculate stage breakdown
    const stageBreakdown: Record<string, { count: number; totalValue: number; weightedValue: number }> = {};
    for (const opp of activeOpportunities) {
      if (!stageBreakdown[opp.stage]) {
        stageBreakdown[opp.stage] = { count: 0, totalValue: 0, weightedValue: 0 };
      }
      stageBreakdown[opp.stage].count += 1;
      stageBreakdown[opp.stage].totalValue += Number(opp.value);
      stageBreakdown[opp.stage].weightedValue += Number(opp.value) * (opp.probability / 100);
    }

    // Calculate win rate
    const wonDeals = closedDeals.filter(d => d.stage === 'CLOSED_WON');
    const lostDeals = closedDeals.filter(d => d.stage === 'CLOSED_LOST');
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;

    // Calculate average deal size (from won deals)
    const avgDealSize = wonDeals.length > 0
      ? wonDeals.reduce((sum, d) => sum + Number(d.value), 0) / wonDeals.length
      : 0;

    // Calculate average sales cycle (days from created to closed)
    const avgSalesCycle = wonDeals.length > 0
      ? Math.round(wonDeals.reduce((sum, d) => {
          const created = new Date(d.createdAt);
          const closed = new Date(d.closedAt!);
          return sum + (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / wonDeals.length)
      : 0;

    // Group closed deals by month for historical data
    const monthlyRevenue: Record<string, { actual: number; deals: number }> = {};
    for (const deal of wonDeals) {
      const month = new Date(deal.closedAt!).toLocaleString('en-US', { month: 'short' });
      if (!monthlyRevenue[month]) {
        monthlyRevenue[month] = { actual: 0, deals: 0 };
      }
      monthlyRevenue[month].actual += Number(deal.value);
      monthlyRevenue[month].deals += 1;
    }

    // Calculate win rate trend by month
    const winRateTrend: { month: string; rate: number; isProjected: boolean }[] = [];
    const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    for (const month of months) {
      const monthDeals = closedDeals.filter(d => {
        const dealMonth = new Date(d.closedAt!).toLocaleString('en-US', { month: 'short' });
        return dealMonth === month;
      });
      const monthWon = monthDeals.filter(d => d.stage === 'CLOSED_WON').length;
      const rate = monthDeals.length > 0 ? Math.round((monthWon / monthDeals.length) * 100) : 0;
      winRateTrend.push({ month, rate: rate || winRate, isProjected: monthDeals.length === 0 });
    }

    // Determine risk level based on probability and value
    const getRiskLevel = (probability: number, value: number): 'low' | 'medium' | 'high' => {
      if (probability >= 60) return 'low';
      if (probability >= 40 || value > 100000) return 'medium';
      return 'high';
    };

    // Map opportunities to forecast deals format
    const forecastDeals = activeOpportunities.map(opp => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage as 'PROSPECTING' | 'QUALIFICATION' | 'NEEDS_ANALYSIS' | 'PROPOSAL' | 'NEGOTIATION',
      value: Number(opp.value),
      probability: opp.probability,
      expectedCloseDate: opp.expectedCloseDate?.toISOString().split('T')[0] || '',
      owner: {
        name: opp.owner?.name || 'Unassigned',
        avatar: opp.owner?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'NA',
      },
      riskLevel: getRiskLevel(opp.probability, Number(opp.value)),
      accountName: opp.account?.name || null,
    }));

    // Calculate forecast accuracy (simulated based on historical data)
    // In production, this would compare past forecasts to actuals
    const forecastAccuracy = {
      accuracy: totalClosed > 5 ? Math.min(95, 75 + winRate * 0.2) : 82,
      target: 85,
      isAtRisk: false,
    };
    forecastAccuracy.isAtRisk = forecastAccuracy.accuracy < forecastAccuracy.target;

    return {
      // Summary metrics
      totalOpportunities: activeOpportunities.length,
      weightedValue: Math.round(weightedValue).toString(),
      totalPipelineValue: Math.round(totalPipelineValue),

      // Forecast accuracy
      forecastAccuracy,

      // Win rate metrics
      winRate,
      avgDealSize: Math.round(avgDealSize),
      avgSalesCycle,
      wonDealsCount: wonDeals.length,
      lostDealsCount: lostDeals.length,

      // Stage breakdown
      stageBreakdown: Object.entries(stageBreakdown).map(([stage, data]) => ({
        stage,
        ...data,
        percentage: Math.round((data.totalValue / totalPipelineValue) * 100) || 0,
      })),

      // Active deals
      deals: forecastDeals,

      // Historical monthly data
      monthlyRevenue: Object.entries(monthlyRevenue).map(([month, data]) => ({
        month,
        actual: data.actual,
        projected: null as number | null,
      })),

      // Win rate trend
      winRateTrend,
    };
  }),
});
