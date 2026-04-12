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
  moveStageSchema,
  type MoveStageInput,
  opportunityHistoryQuerySchema,
  opportunityProductsQuerySchema,
  opportunityPipelineQuerySchema,
  DEFAULT_STAGE_NAMES,
  DEFAULT_STAGE_COLORS,
  DEFAULT_STAGE_PROBABILITIES,
} from '@intelliflow/validators/opportunity';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { mapOpportunityToResponse } from '../../shared/mappers';
import { calculateForecastAccuracy } from '../../shared/forecast-algorithm';
import { type Context } from '../../context';
import { getTenantContext, createTenantWhereClause } from '../../security/tenant-context';
import { createNotification } from '../notifications/notifications.router';
import { getAuditLogger } from '../../security/audit-logger';

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

// ── Error-mapping helpers (reduce cognitive complexity in procedures) ──

function throwOpportunityCreateError(error: { code: string; message: string }): never {
  if (error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND_ERROR') {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
}

function throwOpportunityUpdateError(error: { code: string; message: string }): never {
  const codeMap: Record<string, 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR'> = {
    NOT_FOUND_ERROR: 'NOT_FOUND',
    VALIDATION_ERROR: 'BAD_REQUEST',
  };
  throw new TRPCError({
    code: codeMap[error.code] ?? 'INTERNAL_SERVER_ERROR',
    message: error.message,
  });
}

function throwOpportunityDeleteError(error: { code: string; message: string }): never {
  if (error.code === 'NOT_FOUND_ERROR') {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  if (error.code === 'VALIDATION_ERROR') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
}

function throwMoveStageError(error: { code: string; message: string }): never {
  if (error.code === 'NOT_FOUND_ERROR') {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
}

// ── Deal forecast helpers (extracted for cognitive complexity reduction) ──

type RiskFactor = {
  id: string;
  factor: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
};
type Recommendation = {
  id: string;
  action: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
};

function deriveDealRiskFactors(
  opportunity: {
    probability: number;
    stage: string;
    expectedCloseDate: Date | null;
    contact: unknown;
  },
  stageDefault: number,
  daysSinceActivity: number,
  lastActivity: { timestamp: Date } | null
): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (opportunity.probability < stageDefault) {
    const gap = stageDefault - opportunity.probability;
    factors.push({
      id: 'rf-prob-below-default',
      factor: 'Probability below stage default',
      severity: gap >= 20 ? 'high' : 'medium',
      description: `Current ${opportunity.probability}% vs ${stageDefault}% ${opportunity.stage} default`,
      impact: `${gap} points below expected`,
    });
  }
  if (!opportunity.expectedCloseDate) {
    factors.push({
      id: 'rf-no-close-date',
      factor: 'No expected close date',
      severity: 'high',
      description: 'Expected close date has not been set',
      impact: 'Cannot forecast timeline or measure slippage',
    });
  }
  if (daysSinceActivity > 14) {
    factors.push({
      id: 'rf-activity-gap',
      factor: 'Activity gap',
      severity: daysSinceActivity > 30 ? 'high' : 'medium',
      description: lastActivity
        ? `Last activity was ${daysSinceActivity} days ago`
        : 'No activity recorded',
      impact: 'No recent engagement',
    });
  }
  if (!opportunity.contact) {
    factors.push({
      id: 'rf-no-contact',
      factor: 'No contact associated',
      severity: 'medium',
      description: 'No primary contact linked to this opportunity',
      impact: 'Missing decision-maker relationship',
    });
  }
  if (opportunity.expectedCloseDate && new Date(opportunity.expectedCloseDate) < new Date()) {
    const daysOverdue = Math.floor(
      (Date.now() - new Date(opportunity.expectedCloseDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    factors.push({
      id: 'rf-close-date-slippage',
      factor: 'Close date has passed',
      severity: daysOverdue > 30 ? 'high' : 'medium',
      description: `Expected close was ${daysOverdue} days ago`,
      impact: 'Deal may be stalled or lost',
    });
  }

  return factors;
}

function deriveDealRecommendations(
  opportunity: {
    probability: number;
    stage: string;
    expectedCloseDate: Date | null;
    contact: unknown;
  },
  stageDefault: number,
  daysSinceActivity: number
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (daysSinceActivity > 7) {
    recs.push({
      id: 'rec-followup',
      action: 'SCHEDULE_CALL',
      title: 'Schedule follow-up call',
      description: 'Schedule follow-up call to qualify deal status',
      priority: daysSinceActivity > 14 ? 'high' : 'medium',
    });
  }
  if (!opportunity.contact) {
    recs.push({
      id: 'rec-add-contact',
      action: 'ADD_CONTACT',
      title: 'Add primary contact',
      description: 'Link a decision-maker contact to improve deal tracking',
      priority: 'high',
    });
  }
  if (opportunity.probability < stageDefault && opportunity.probability > 0) {
    recs.push({
      id: 'rec-update-prob',
      action: 'UPDATE_PROBABILITY',
      title: 'Review deal probability',
      description: `Current ${opportunity.probability}% is below ${opportunity.stage} default of ${stageDefault}%`,
      priority: 'medium',
    });
  }
  if (!opportunity.expectedCloseDate) {
    recs.push({
      id: 'rec-set-close-date',
      action: 'SET_CLOSE_DATE',
      title: 'Set expected close date',
      description: 'Add a close date to enable timeline tracking and forecasting',
      priority: 'high',
    });
  }

  return recs;
}

function deriveProbabilityHistory(
  activities: { type: string; stageTo: string | null; timestamp: Date }[],
  stageDefaults: Record<string, number>
): { date: string; probability: number; event?: string }[] {
  const history: { date: string; probability: number; event?: string }[] = [];
  for (const activity of activities) {
    if (activity.type === 'STAGE_CHANGE' && activity.stageTo) {
      const toStage = activity.stageTo;
      history.push({
        date: new Date(activity.timestamp).toISOString().split('T')[0],
        probability: stageDefaults[toStage] ?? 50,
        event: `Stage → ${toStage.replaceAll('_', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase())}`,
      });
    }
  }
  return history;
}

function computeConfidenceScore(
  activityCount: number,
  opportunity: { probability: number; contact: unknown; expectedCloseDate: Date | null },
  stageDefault: number
): number {
  let score = 0;
  let activityBonus: number;
  if (activityCount >= 5) {
    activityBonus = 0.25;
  } else if (activityCount >= 2) {
    activityBonus = 0.15;
  } else if (activityCount >= 1) {
    activityBonus = 0.1;
  } else {
    activityBonus = 0;
  }
  score += activityBonus;
  score += opportunity.probability === stageDefault ? 0.1 : 0.25;
  score += opportunity.contact ? 0.25 : 0;
  score += opportunity.expectedCloseDate ? 0.25 : 0;
  return score;
}

function buildRangeFilter(
  min: number | undefined,
  max: number | undefined
): Record<string, number> | undefined {
  if (min === undefined && max === undefined) return undefined;
  const filter: Record<string, number> = {};
  if (min !== undefined) filter.gte = min;
  if (max !== undefined) filter.lte = max;
  return filter;
}

function buildDateRangeFilter(
  from: Date | undefined,
  to: Date | undefined
): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const filter: Record<string, Date> = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

function buildOpportunityWhereClause(input: {
  search?: string;
  stage?: string[];
  ownerId?: string;
  accountId?: string;
  contactId?: string;
  minValue?: number;
  maxValue?: number;
  minProbability?: number;
  maxProbability?: number;
  dateFrom?: Date;
  dateTo?: Date;
}): any {
  const where: any = { deletedAt: null };

  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
    ];
  }
  if (input.stage && input.stage.length > 0) where.stage = { in: input.stage };
  if (input.ownerId) where.ownerId = input.ownerId;
  if (input.accountId) where.accountId = input.accountId;
  if (input.contactId) where.contactId = input.contactId;

  const valueFilter = buildRangeFilter(input.minValue, input.maxValue);
  if (valueFilter) where.value = valueFilter;

  const probFilter = buildRangeFilter(input.minProbability, input.maxProbability);
  if (probFilter) where.probability = probFilter;

  const dateFilter = buildDateRangeFilter(input.dateFrom, input.dateTo);
  if (dateFilter) where.expectedCloseDate = dateFilter;

  return where;
}

function resolveStageNotification(targetStage: string): {
  type: 'deal_won' | 'deal_lost' | 'deal_stage_changed';
  title: string;
  priority: 'high' | 'normal';
} {
  if (targetStage === 'CLOSED_WON')
    return { type: 'deal_won', title: 'Deal won!', priority: 'high' };
  if (targetStage === 'CLOSED_LOST')
    return { type: 'deal_lost', title: 'Deal lost', priority: 'normal' };
  return { type: 'deal_stage_changed', title: `Deal moved to ${targetStage}`, priority: 'normal' };
}

function getRiskLevel(probability: number, value: number): 'low' | 'medium' | 'high' {
  if (probability >= 60) return 'low';
  if (probability >= 40 || value > 100000) return 'medium';
  return 'high';
}

function buildStageBreakdown(
  activeOpportunities: { stage: string; value: unknown; probability: number }[]
): Record<string, { count: number; totalValue: number; weightedValue: number }> {
  const breakdown: Record<string, { count: number; totalValue: number; weightedValue: number }> =
    {};
  for (const opp of activeOpportunities) {
    if (!breakdown[opp.stage]) {
      breakdown[opp.stage] = { count: 0, totalValue: 0, weightedValue: 0 };
    }
    breakdown[opp.stage].count += 1;
    breakdown[opp.stage].totalValue += Number(opp.value);
    breakdown[opp.stage].weightedValue += Number(opp.value) * (opp.probability / 100);
  }
  return breakdown;
}

function buildMonthlyRevenue(
  wonDeals: { closedAt: Date | null; value: unknown }[]
): Record<string, { actual: number; deals: number }> {
  const monthlyRevenue: Record<string, { actual: number; deals: number }> = {};
  for (const deal of wonDeals) {
    const month = new Date(deal.closedAt!).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    if (!monthlyRevenue[month]) {
      monthlyRevenue[month] = { actual: 0, deals: 0 };
    }
    monthlyRevenue[month].actual += Number(deal.value);
    monthlyRevenue[month].deals += 1;
  }
  return monthlyRevenue;
}

// ── Forecast calculation helpers ──

type WonDeal = { value: unknown; closedAt: Date | null; createdAt: Date };

function computeWeightedValue(opps: { value: unknown; probability: number }[]): number {
  return opps.reduce((sum, opp) => {
    const value = Number(opp.value) || 0;
    const probability = (opp.probability ?? 0) / 100;
    return sum + value * probability;
  }, 0);
}

function computeTotalPipelineValue(opps: { value: unknown }[]): number {
  return opps.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
}

function computeWinMetrics(
  closedDeals: { stage: string; value: unknown; closedAt: Date | null; createdAt: Date }[]
): { wonDeals: WonDeal[]; lostDeals: WonDeal[]; winRate: number } {
  const wonDeals = closedDeals.filter((d) => d.stage === 'CLOSED_WON');
  const lostDeals = closedDeals.filter((d) => d.stage === 'CLOSED_LOST');
  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;
  return { wonDeals, lostDeals, winRate };
}

function computeAvgDealSize(wonDeals: WonDeal[]): number {
  if (wonDeals.length === 0) return 0;
  return wonDeals.reduce((sum, d) => sum + Number(d.value), 0) / wonDeals.length;
}

function computeAvgSalesCycle(wonDeals: WonDeal[]): number {
  if (wonDeals.length === 0) return 0;
  const totalDays = wonDeals.reduce((sum, d) => {
    const created = new Date(d.createdAt);
    const closed = new Date(d.closedAt!);
    return sum + (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  }, 0);
  return Math.round(totalDays / wonDeals.length);
}

function buildOwnerAvatar(name: string | null | undefined): string {
  if (!name) return 'NA';
  return (
    name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase() || 'NA'
  );
}

function buildWinRateTrend(
  closedDeals: { closedAt: Date | null; stage: string }[],
  overallWinRate: number
): { month: string; rate: number; isProjected: boolean }[] {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  return months.map((month) => {
    const monthDeals = closedDeals.filter(
      (d) =>
        new Date(d.closedAt!).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) === month
    );
    const monthWon = monthDeals.filter((d) => d.stage === 'CLOSED_WON').length;
    const rate = monthDeals.length > 0 ? Math.round((monthWon / monthDeals.length) * 100) : 0;
    return { month, rate: rate || overallWinRate, isProjected: monthDeals.length === 0 };
  });
}

// ── moveStage helpers ──

async function executeMoveStage(
  ctx: Context,
  input: Pick<MoveStageInput, 'id' | 'targetStage' | 'reason'>,
  userId: string,
  tenantId: string
) {
  if (input.targetStage === 'CLOSED_WON') {
    // IFC-065: Route through CloseDealWonUseCase for enriched event + notification
    const closeDealWonService = ctx.services?.closeDealWon;
    if (!closeDealWonService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'CloseDealWon service not available',
      });
    }
    return closeDealWonService.execute({
      opportunityId: input.id,
      closedBy: userId,
      tenantId,
    });
  }

  if (input.targetStage === 'CLOSED_LOST') {
    // IFC-066: Route through CloseDealLostUseCase for enriched event + notification
    const closeDealLostService = ctx.services?.closeDealLost;
    if (!closeDealLostService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'CloseDealLost service not available',
      });
    }
    return closeDealLostService.execute({
      opportunityId: input.id,
      reason: input.reason || '',
      closedBy: userId,
      tenantId,
    });
  }

  const opportunityService = getOpportunityService(ctx);
  return opportunityService.changeStage(input.id, input.targetStage, userId, tenantId);
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
      throwOpportunityCreateError(result.error);
    }

    // Fire-and-forget notification
    createNotification(
      ctx.prismaWithTenant,
      {
        userId: typedCtx.tenant.userId,
        tenantId: typedCtx.tenant.tenantId,
        type: 'deal_assigned',
        title: 'New deal created',
        body: `Deal "${result.value.name}" has been created`,
        priority: 'normal',
        entityType: 'opportunity',
        entityId: result.value.id.value,
        entityName: result.value.name,
        actionUrl: `/deals/${result.value.id.value}`,
      },
      ctx.services?.notificationOrchestrator
    ).catch((err) => console.error('[opportunity.router] Notification failed:', err));

    // IFC-281: Fire-and-forget audit logging
    const auditLogger = getAuditLogger(ctx.prisma);
    auditLogger
      .logAction('CREATE', 'opportunity', result.value.id.value, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        afterState: {
          name: result.value.name,
          stage: result.value.stage,
          value: result.value.value.amount,
        },
      })
      .catch((err) => console.error('[opportunity.router] Audit log failed:', err));

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * Get a single opportunity by ID — enriched with owner/account/contact relations
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const record = await typedCtx.prismaWithTenant.opportunity.findFirst({
      where: { id: input.id, deletedAt: null } as any,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true, website: true } },
        contact: {
          select: { id: true, firstName: true, lastName: true, title: true, email: true },
        },
      },
    });

    if (!record) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Opportunity not found: ${input.id}`,
      });
    }

    const numericValue = Number(record.value);
    return {
      id: record.id,
      name: record.name,
      value: numericValue,
      currency: 'USD',
      probability: record.probability,
      stage: record.stage,
      expectedCloseDate: record.expectedCloseDate,
      accountId: record.accountId,
      contactId: record.contactId,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      weightedValue: numericValue * (record.probability / 100),
      isClosed: record.stage === 'CLOSED_WON' || record.stage === 'CLOSED_LOST',
      isWon: record.stage === 'CLOSED_WON',
      isLost: record.stage === 'CLOSED_LOST',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      description: record.description,
      owner: record.owner,
      account: record.account,
      contact: record.contact,
    };
  }),

  /**
   * List opportunities with filtering and pagination
   */
  list: tenantProcedure.input(opportunityQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = input;

    const skip = (page - 1) * limit;
    const baseWhere = buildOpportunityWhereClause(input);
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
      typedCtx.tenant.userId,
      typedCtx.tenant.tenantId
    );

    if (result.isFailure) {
      throwOpportunityUpdateError(result.error);
    }

    // IFC-281: Fire-and-forget audit logging
    const auditLogger = getAuditLogger(ctx.prisma);
    auditLogger
      .logAction('UPDATE', 'opportunity', id, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        afterState: { name: result.value.name, stage: result.value.stage },
      })
      .catch((err) => console.error('[opportunity.router] Audit log failed:', err));

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * Delete an opportunity (soft-delete — moves to trash)
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const opportunityService = getOpportunityService(ctx);

    const result = await opportunityService.deleteOpportunity(input.id, typedCtx.tenant.tenantId);

    if (result.isFailure) {
      throwOpportunityDeleteError(result.error);
    }

    // IFC-281: Fire-and-forget audit logging
    const auditLogger = getAuditLogger(ctx.prisma);
    auditLogger
      .logAction('DELETE', 'opportunity', input.id, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      })
      .catch((err) => console.error('[opportunity.router] Audit log failed:', err));

    return { success: true, id: input.id };
  }),

  /**
   * List soft-deleted (trashed) opportunities with search + pagination
   */
  listTrashed: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        sortBy: z.enum(['name', 'value', 'deletedAt', 'stage']).optional().default('deletedAt'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        page: z.number().int().positive().optional().default(1),
        limit: z.number().int().positive().max(100).optional().default(15),
      })
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { page, limit, sortBy, sortOrder, search } = input;
      const skip = (page - 1) * limit;

      const baseWhere: Record<string, unknown> = { deletedAt: { not: null } };
      if (search) {
        baseWhere.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { account: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }
      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      const [opportunities, total] = await Promise.all([
        typedCtx.prismaWithTenant.opportunity.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            account: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true } },
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
   * Restore a soft-deleted opportunity from trash
   */
  restore: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const opportunityService = getOpportunityService(ctx);

      const result = await opportunityService.restoreOpportunity(
        input.id,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) {
        throwOpportunityDeleteError(result.error);
      }

      return { success: true, id: input.id };
    }),

  /**
   * Permanently delete a trashed opportunity (cannot be undone)
   */
  permanentDelete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const opportunityService = getOpportunityService(ctx);

      const result = await opportunityService.permanentDeleteOpportunity(
        input.id,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) {
        throwOpportunityDeleteError(result.error);
      }

      // IFC-281: Fire-and-forget audit logging
      const auditLogger = getAuditLogger(ctx.prisma);
      auditLogger
        .logAction('DELETE', 'opportunity', input.id, typedCtx.tenant.tenantId, {
          actorId: typedCtx.tenant.userId,
          metadata: { permanent: true },
        })
        .catch((err) => console.error('[opportunity.router] Audit log failed:', err));

      return { success: true, id: input.id };
    }),

  /**
   * Move opportunity to a new pipeline stage
   * Routes to appropriate service method based on target stage:
   * - CLOSED_WON → markAsWon()
   * - CLOSED_LOST → markAsLost(reason)
   * - Others → changeStage()
   */
  moveStage: tenantProcedure.input(moveStageSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    // IFC-281: Capture previous stage BEFORE mutation for audit trail
    const preMutationRecord = await typedCtx.prismaWithTenant.opportunity.findUnique({
      where: { id: input.id },
      select: { stage: true },
    });
    const previousStage = preMutationRecord?.stage ?? undefined;

    const result = await executeMoveStage(
      ctx,
      input,
      typedCtx.tenant.userId,
      typedCtx.tenant.tenantId
    );

    if (result.isFailure) {
      throwMoveStageError(result.error);
    }

    const notif = resolveStageNotification(input.targetStage);
    createNotification(
      ctx.prismaWithTenant,
      {
        userId: typedCtx.tenant.userId,
        tenantId: typedCtx.tenant.tenantId,
        type: notif.type,
        title: notif.title,
        body: `"${result.value.name}" moved to ${input.targetStage}`,
        priority: notif.priority,
        entityType: 'opportunity',
        entityId: result.value.id.value,
        entityName: result.value.name,
        actionUrl: `/deals/${result.value.id.value}`,
      },
      ctx.services?.notificationOrchestrator
    ).catch((err) => console.error('[opportunity.router] Notification failed:', err));

    // IFC-281: Fire-and-forget audit logging with stage transition metadata
    const auditLogger = getAuditLogger(ctx.prisma);
    auditLogger
      .logAction('UPDATE', 'opportunity', result.value.id.value, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        metadata: { targetStage: input.targetStage, previousStage },
        afterState: { name: result.value.name, stage: result.value.stage },
      })
      .catch((err) => console.error('[opportunity.router] Audit log failed:', err));

    return mapOpportunityToResponse(result.value);
  }),

  /**
   * Get activity history for an opportunity with cursor pagination
   * Uses composite index [opportunityId, timestamp(sort: Desc)] on ActivityEvent
   */
  getHistory: tenantProcedure.input(opportunityHistoryQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const where: any = { opportunityId: input.opportunityId };

    if (input.types && input.types.length > 0) {
      where.type = { in: input.types };
    }
    if (input.cursor) {
      where.timestamp = { lt: new Date(input.cursor) };
    }

    const events = await typedCtx.prismaWithTenant.activityEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: input.limit + 1,
    });

    const hasMore = events.length > input.limit;
    const items = hasMore ? events.slice(0, input.limit) : events;

    return {
      items,
      nextCursor: hasMore ? items.at(-1)!.timestamp.toISOString() : null,
      hasMore,
    };
  }),

  /**
   * Get deal products (line items) for an opportunity
   * DealProduct tenant isolation via parent opportunity FK
   */
  getProducts: tenantProcedure
    .input(opportunityProductsQuerySchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const products = await typedCtx.prismaWithTenant.dealProduct.findMany({
        where: { opportunityId: input.opportunityId },
        orderBy: { createdAt: 'asc' },
      });

      const totalValue = products.reduce((sum, p) => sum + Number(p.totalPrice), 0);

      return { products, totalValue };
    }),

  /**
   * Get pipeline visualization data
   * Combines stage configuration with opportunity aggregation
   */
  getPipeline: tenantProcedure
    .input(opportunityPipelineQuerySchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const [stageConfigs, byStage] = await Promise.all([
        typedCtx.prismaWithTenant.pipelineStageConfig.findMany({
          where: { tenantId: typedCtx.tenant.tenantId },
          orderBy: { order: 'asc' },
        }),
        typedCtx.prismaWithTenant.opportunity.groupBy({
          by: ['stage'],
          where: { deletedAt: null },
          _count: true,
          _sum: { value: true },
          _avg: { probability: true },
        }),
      ]);

      const configMap = new Map(stageConfigs.map((c) => [c.stageKey, c]));

      const stages = OPPORTUNITY_STAGES.filter(
        (stage) => input.includeClosedStages || !['CLOSED_WON', 'CLOSED_LOST'].includes(stage)
      )
        .map((stageKey, index) => {
          const config = configMap.get(stageKey);
          const data = byStage.find((s) => s.stage === stageKey);
          return {
            stageKey,
            displayName: config?.displayName || DEFAULT_STAGE_NAMES[stageKey] || stageKey,
            color: config?.color || DEFAULT_STAGE_COLORS[stageKey] || '#6366f1',
            order: config?.order ?? index,
            count: data?._count ?? 0,
            totalValue: data?._sum?.value?.toString() || '0',
            weightedValue: data
              ? Math.round(
                  (Number(data._sum?.value || 0) * (data._avg?.probability || 0)) / 100
                ).toString()
              : '0',
            probability: config?.probability ?? DEFAULT_STAGE_PROBABILITIES[stageKey] ?? 0,
          };
        })
        .sort((a, b) => a.order - b.order);

      const totalOpportunities = byStage.reduce((sum, s) => sum + s._count, 0);
      const totalPipelineValue = byStage.reduce((sum, s) => sum + Number(s._sum?.value || 0), 0);

      return { stages, totalOpportunities, totalPipelineValue: totalPipelineValue.toString() };
    }),

  /**
   * Get opportunity statistics and pipeline analytics
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const [total, byStage, totalValue, avgProbability] = await Promise.all([
      typedCtx.prismaWithTenant.opportunity.count({ where: { deletedAt: null } }),
      typedCtx.prismaWithTenant.opportunity.groupBy({
        by: ['stage'],
        where: { deletedAt: null },
        _count: true,
        _sum: { value: true },
      }),
      typedCtx.prismaWithTenant.opportunity.aggregate({
        where: { deletedAt: null },
        _sum: { value: true },
      }),
      typedCtx.prismaWithTenant.opportunity.aggregate({
        where: { deletedAt: null },
        _avg: { probability: true },
      }),
    ]);

    return {
      total: total ?? 0,
      byStage: (byStage ?? []).reduce(
        (acc, item) => {
          acc[item.stage] = {
            count: item._count,
            totalValue: item._sum?.value?.toString() || '0',
          };
          return acc;
        },
        {} as Record<string, { count: number; totalValue: string }>
      ),
      totalValue: totalValue?._sum?.value?.toString() || '0',
      averageProbability: avgProbability?._avg?.probability || 0,
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
        deletedAt: null,
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
        deletedAt: null,
      },
      select: {
        id: true,
        value: true,
        stage: true,
        closedAt: true,
        createdAt: true,
      },
    });

    const activeOpps = activeOpportunities ?? [];
    const closed = closedDeals ?? [];

    const weightedValue = computeWeightedValue(activeOpps);
    const totalPipelineValue = computeTotalPipelineValue(activeOpps);
    const stageBreakdown = buildStageBreakdown(activeOpps);

    const { wonDeals, lostDeals, winRate } = computeWinMetrics(closed);
    const avgDealSize = computeAvgDealSize(wonDeals);
    const avgSalesCycle = computeAvgSalesCycle(wonDeals);

    const monthlyRevenue = buildMonthlyRevenue(wonDeals);
    const winRateTrend = buildWinRateTrend(closed, winRate);

    // Map opportunities to forecast deals format
    const forecastDeals = activeOpps.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage as
        | 'PROSPECTING'
        | 'QUALIFICATION'
        | 'NEEDS_ANALYSIS'
        | 'PROPOSAL'
        | 'NEGOTIATION',
      value: Number(opp.value),
      probability: opp.probability,
      expectedCloseDate: opp.expectedCloseDate?.toISOString().split('T')[0] || '',
      owner: {
        name: opp.owner?.name || 'Unassigned',
        avatar: buildOwnerAvatar(opp.owner?.name),
      },
      riskLevel: getRiskLevel(opp.probability, Number(opp.value)),
      accountName: opp.account?.name || null,
    }));

    // Calculate forecast accuracy from real historical monthly data
    const forecastAccuracy = calculateForecastAccuracy(monthlyRevenue, weightedValue, winRate);

    return {
      // Summary metrics
      totalOpportunities: activeOpps.length,
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

  /**
   * Get deal-specific forecast with risk factors, recommendations, history
   * PG-131: Deterministic risk scoring — no AI chain dependency
   */
  dealForecast: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    // Fetch opportunity with relations
    const opportunity = await typedCtx.prismaWithTenant.opportunity.findUnique({
      where: { id: input.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, title: true } },
      },
    });

    if (!opportunity) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Opportunity not found' });
    }

    // Fetch activity events for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const activities = await typedCtx.prismaWithTenant.activityEvent.findMany({
      where: {
        opportunityId: input.id,
        timestamp: { gte: thirtyDaysAgo },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Stage probability defaults (mirrors frontend STAGE_PROBABILITIES)
    const STAGE_DEFAULTS: Record<string, number> = {
      PROSPECTING: 10,
      QUALIFICATION: 20,
      NEEDS_ANALYSIS: 40,
      PROPOSAL: 60,
      NEGOTIATION: 80,
      CLOSED_WON: 100,
      CLOSED_LOST: 0,
    };

    const stageDefault = STAGE_DEFAULTS[opportunity.stage] ?? 50;

    const lastActivity = activities.length > 0 ? (activities.at(-1) ?? null) : null;
    const daysSinceActivity = lastActivity
      ? Math.floor(
          (Date.now() - new Date(lastActivity.timestamp).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 999;

    const riskFactors = deriveDealRiskFactors(
      opportunity,
      stageDefault,
      daysSinceActivity,
      lastActivity
    );
    const recommendations = deriveDealRecommendations(opportunity, stageDefault, daysSinceActivity);
    const history = deriveProbabilityHistory(activities, STAGE_DEFAULTS);
    const confidenceScore = computeConfidenceScore(activities.length, opportunity, stageDefault);

    const ownerName = opportunity.owner?.name || 'Unassigned';
    const ownerAvatar = ownerName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase();

    return {
      deal: {
        id: opportunity.id,
        name: opportunity.name,
        stage: opportunity.stage,
        probability: opportunity.probability,
        value: Number(opportunity.value),
        expectedCloseDate: opportunity.expectedCloseDate?.toISOString().split('T')[0] ?? null,
        owner: { name: ownerName, avatar: ownerAvatar },
        account: opportunity.account ? { name: opportunity.account.name } : null,
        contact: opportunity.contact
          ? {
              name: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`.trim(),
              title: opportunity.contact.title ?? '',
            }
          : null,
      },
      riskFactors,
      recommendations,
      history,
      confidence: Math.min(1, confidenceScore),
      lastActivityAt: lastActivity ? lastActivity.timestamp.toISOString() : null,
      stageDefault,
    };
  }),
});
