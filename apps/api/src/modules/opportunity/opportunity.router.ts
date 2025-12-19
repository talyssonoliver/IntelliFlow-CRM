/**
 * Opportunity Router
 *
 * Provides type-safe tRPC endpoints for opportunity/deal management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Stage progression and pipeline analytics
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../server';
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  opportunityQuerySchema,
  idSchema,
} from '@intelliflow/validators/opportunity';

export const opportunityRouter = router({
  /**
   * Create a new opportunity
   */
  create: protectedProcedure.input(createOpportunitySchema).mutation(async ({ ctx, input }) => {
    // Validate account exists
    const account = await ctx.prisma.account.findUnique({
      where: { id: input.accountId },
    });

    if (!account) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Account with ID ${input.accountId} not found`,
      });
    }

    // Validate contact exists if provided
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

    const opportunity = await ctx.prisma.opportunity.create({
      data: {
        ...input,
        ownerId: ctx.user.userId,
      },
    });

    return opportunity;
  }),

  /**
   * Get a single opportunity by ID
   */
  getById: protectedProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const opportunity = await ctx.prisma.opportunity.findUnique({
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
        account: {
          select: {
            id: true,
            name: true,
            website: true,
            industry: true,
          },
        },
        contact: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            title: true,
          },
        },
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!opportunity) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Opportunity with ID ${input.id} not found`,
      });
    }

    return opportunity;
  }),

  /**
   * List opportunities with filtering and pagination
   */
  list: protectedProcedure.input(opportunityQuerySchema).query(async ({ ctx, input }) => {
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

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (stage && stage.length > 0) {
      where.stage = { in: stage };
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (accountId) {
      where.accountId = accountId;
    }

    if (contactId) {
      where.contactId = contactId;
    }

    if (minValue !== undefined || maxValue !== undefined) {
      where.value = {};
      if (minValue !== undefined) where.value.gte = minValue;
      if (maxValue !== undefined) where.value.lte = maxValue;
    }

    if (minProbability !== undefined || maxProbability !== undefined) {
      where.probability = {};
      if (minProbability !== undefined) where.probability.gte = minProbability;
      if (maxProbability !== undefined) where.probability.lte = maxProbability;
    }

    if (dateFrom || dateTo) {
      where.expectedCloseDate = {};
      if (dateFrom) where.expectedCloseDate.gte = dateFrom;
      if (dateTo) where.expectedCloseDate.lte = dateTo;
    }

    // Execute queries in parallel
    const [opportunities, total] = await Promise.all([
      ctx.prisma.opportunity.findMany({
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
      ctx.prisma.opportunity.count({ where }),
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
  update: protectedProcedure.input(updateOpportunitySchema).mutation(async ({ ctx, input }) => {
    const { id, accountId, contactId, ...data } = input;

    // Check if opportunity exists
    const existingOpportunity = await ctx.prisma.opportunity.findUnique({
      where: { id },
    });

    if (!existingOpportunity) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Opportunity with ID ${id} not found`,
      });
    }

    // Validate account exists if provided
    if (accountId !== undefined) {
      const account = await ctx.prisma.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Account with ID ${accountId} not found`,
        });
      }
    }

    // Validate contact exists if provided
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

    // Update the opportunity
    const opportunity = await ctx.prisma.opportunity.update({
      where: { id },
      data: {
        ...data,
        ...(accountId !== undefined && { accountId }),
        ...(contactId !== undefined && { contactId }),
      },
    });

    return opportunity;
  }),

  /**
   * Delete an opportunity
   */
  delete: protectedProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    // Check if opportunity exists
    const existingOpportunity = await ctx.prisma.opportunity.findUnique({
      where: { id: input.id },
    });

    if (!existingOpportunity) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Opportunity with ID ${input.id} not found`,
      });
    }

    // Delete the opportunity
    await ctx.prisma.opportunity.delete({
      where: { id: input.id },
    });

    return { success: true, id: input.id };
  }),

  /**
   * Get opportunity statistics and pipeline analytics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byStage, totalValue, avgProbability] = await Promise.all([
      ctx.prisma.opportunity.count(),
      ctx.prisma.opportunity.groupBy({
        by: ['stage'],
        _count: true,
        _sum: { value: true },
      }),
      ctx.prisma.opportunity.aggregate({
        _sum: { value: true },
      }),
      ctx.prisma.opportunity.aggregate({
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
  forecast: protectedProcedure.query(async ({ ctx }) => {
    const opportunities = await ctx.prisma.opportunity.findMany({
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
