/**
 * Lead Router
 *
 * Provides type-safe tRPC endpoints for lead management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - AI scoring endpoint (placeholder)
 * - Lead qualification and conversion
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../server';
import {
  createLeadSchema,
  updateLeadSchema,
  leadQuerySchema,
  qualifyLeadSchema,
  convertLeadSchema,
  idSchema,
} from '@intelliflow/validators/lead';
import { LeadStatus } from '@intelliflow/db';

export const leadRouter = router({
  /**
   * Create a new lead
   */
  create: protectedProcedure.input(createLeadSchema).mutation(async ({ ctx, input }) => {
    const lead = await ctx.prisma.lead.create({
      data: {
        ...input,
        ownerId: ctx.user.userId,
        status: 'NEW',
        score: 0,
      },
    });

    return lead;
  }),

  /**
   * Get a single lead by ID
   */
  getById: protectedProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const lead = await ctx.prisma.lead.findUnique({
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
        contact: true,
        aiScores: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!lead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${input.id} not found`,
      });
    }

    return lead;
  }),

  /**
   * List leads with filtering and pagination
   */
  list: protectedProcedure.input(leadQuerySchema).query(async ({ ctx, input }) => {
    const {
      page = 1,
      limit = 20,
      status,
      source,
      minScore,
      maxScore,
      search,
      ownerId,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (source && source.length > 0) {
      where.source = { in: source };
    }

    if (minScore !== undefined || maxScore !== undefined) {
      where.score = {};
      if (minScore !== undefined) where.score.gte = minScore;
      if (maxScore !== undefined) where.score.lte = maxScore;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    // Execute queries in parallel
    const [leads, total] = await Promise.all([
      ctx.prisma.lead.findMany({
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
      ctx.prisma.lead.count({ where }),
    ]);

    return {
      leads,
      total,
      page,
      limit,
      hasMore: skip + leads.length < total,
    };
  }),

  /**
   * Update a lead
   */
  update: protectedProcedure.input(updateLeadSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    // Check if lead exists
    const existingLead = await ctx.prisma.lead.findUnique({
      where: { id },
    });

    if (!existingLead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${id} not found`,
      });
    }

    // Update the lead
    const lead = await ctx.prisma.lead.update({
      where: { id },
      data,
    });

    return lead;
  }),

  /**
   * Delete a lead
   */
  delete: protectedProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    // Check if lead exists
    const existingLead = await ctx.prisma.lead.findUnique({
      where: { id: input.id },
    });

    if (!existingLead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${input.id} not found`,
      });
    }

    // Delete the lead
    await ctx.prisma.lead.delete({
      where: { id: input.id },
    });

    return { success: true, id: input.id };
  }),

  /**
   * Qualify a lead (mark as QUALIFIED)
   */
  qualify: protectedProcedure.input(qualifyLeadSchema).mutation(async ({ ctx, input }) => {
    const lead = await ctx.prisma.lead.findUnique({
      where: { id: input.leadId },
    });

    if (!lead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${input.leadId} not found`,
      });
    }

    if (lead.status === 'QUALIFIED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Lead is already qualified',
      });
    }

    // Update lead status to QUALIFIED
    const updatedLead = await ctx.prisma.lead.update({
      where: { id: input.leadId },
      data: { status: 'QUALIFIED' },
    });

    // Create a task for follow-up (optional)
    await ctx.prisma.task.create({
      data: {
        title: 'Follow up with qualified lead',
        description: input.reason,
        priority: 'HIGH',
        status: 'PENDING',
        ownerId: ctx.user.userId,
        leadId: input.leadId,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
      },
    });

    return updatedLead;
  }),

  /**
   * Convert a lead to a contact (and optionally create an account)
   */
  convert: protectedProcedure.input(convertLeadSchema).mutation(async ({ ctx, input }) => {
    const lead = await ctx.prisma.lead.findUnique({
      where: { id: input.leadId },
    });

    if (!lead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${input.leadId} not found`,
      });
    }

    if (lead.status === 'CONVERTED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Lead is already converted',
      });
    }

    // Use a transaction to ensure atomicity
    const result = await ctx.prisma.$transaction(async (tx) => {
      let accountId: string | undefined;

      // Create account if requested
      if (input.createAccount && lead.company) {
        const account = await tx.account.create({
          data: {
            name: input.accountName || lead.company,
            ownerId: ctx.user.userId,
          },
        });
        accountId = account.id;
      }

      // Create contact from lead
      const contact = await tx.contact.create({
        data: {
          email: lead.email,
          firstName: lead.firstName || 'Unknown',
          lastName: lead.lastName || 'Contact',
          title: lead.title,
          phone: lead.phone,
          ownerId: ctx.user.userId,
          accountId,
          leadId: lead.id,
        },
      });

      // Update lead status to CONVERTED
      const updatedLead = await tx.lead.update({
        where: { id: input.leadId },
        data: { status: 'CONVERTED' },
      });

      return { lead: updatedLead, contact, accountId };
    });

    return result;
  }),

  /**
   * AI Score endpoint (placeholder)
   *
   * This endpoint will trigger AI scoring for a lead.
   * In production, this would:
   * - Queue the lead for AI processing
   * - Call LangChain/CrewAI agents
   * - Store the score in the AIScore table
   * - Update the lead's score field
   */
  scoreWithAI: protectedProcedure
    .input(z.object({ leadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${input.leadId} not found`,
        });
      }

      // Stub: AI scoring integration pending (will use LangChain/CrewAI)
      // NOSONAR: Math.random() is safe here - placeholder mock data for development only,
      // will be replaced with actual AI scoring when ai-worker integration is complete
      const mockScore = Math.floor(Math.random() * 100); // NOSONAR
      const mockConfidence = Math.random(); // NOSONAR

      // Create AI score record
      await ctx.prisma.aIScore.create({
        data: {
          leadId: input.leadId,
          score: mockScore,
          confidence: mockConfidence,
          factors: {
            engagement: 0.7,
            company_fit: 0.8,
            timing: 0.6,
          },
          modelVersion: 'v0.1.0-placeholder',
          scoredById: ctx.user.userId,
        },
      });

      // Update lead score
      await ctx.prisma.lead.update({
        where: { id: input.leadId },
        data: { score: mockScore },
      });

      return {
        leadId: input.leadId,
        score: mockScore,
        confidence: mockConfidence,
        message:
          'AI scoring is currently a placeholder. Integration with LangChain/CrewAI pending.',
      };
    }),

  /**
   * Get lead statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byStatus, avgScore] = await Promise.all([
      ctx.prisma.lead.count(),
      ctx.prisma.lead.groupBy({
        by: ['status'],
        _count: true,
      }),
      ctx.prisma.lead.aggregate({
        _avg: { score: true },
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
      averageScore: avgScore._avg.score || 0,
    };
  }),
});
