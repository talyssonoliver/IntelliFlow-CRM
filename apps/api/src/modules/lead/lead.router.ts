/**
 * Lead Router
 *
 * Provides type-safe tRPC endpoints for lead management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - AI scoring endpoint
 * - Lead qualification and conversion
 *
 * Uses LeadService from application layer (hexagonal architecture)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '../../trpc';
import { PhoneNumber } from '@intelliflow/domain';
import {
  createLeadSchema,
  updateLeadSchema,
  leadQuerySchema,
  qualifyLeadSchema,
  convertLeadSchema,
  idSchema,
} from '@intelliflow/validators/lead';
import { mapLeadToResponse } from '../../shared/mappers';
import type { Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Helper to get lead service with null check
 */
function getLeadService(ctx: Context) {
  if (!ctx.services?.lead) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Lead service not available',
    });
  }
  return ctx.services.lead;
}

export const leadRouter = createTRPCRouter({
  /**
   * Create a new lead using LeadService
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  create: tenantProcedure.input(createLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const result = await leadService.createLead({
      ...input,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return mapLeadToResponse(result.value);
  }),

  /**
   * Get a single lead by ID
   * Uses LeadService for business logic validation
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const result = await leadService.getLeadById(input.id);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    return mapLeadToResponse(result.value);
  }),

  /**
   * List leads with filtering and pagination
   * Uses direct Prisma for complex query building
   * SECURITY: Uses tenantProcedure and createTenantWhereClause for isolation
   */
  list: tenantProcedure.input(leadQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
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

    // Build where clause with tenant isolation
    const baseWhere: Record<string, unknown> = {};

    if (status && status.length > 0) {
      baseWhere.status = { in: status };
    }

    if (source && source.length > 0) {
      baseWhere.source = { in: source };
    }

    if (minScore !== undefined || maxScore !== undefined) {
      baseWhere.score = {};
      if (minScore !== undefined) (baseWhere.score as Record<string, number>).gte = minScore;
      if (maxScore !== undefined) (baseWhere.score as Record<string, number>).lte = maxScore;
    }

    if (search) {
      baseWhere.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (dateFrom || dateTo) {
      baseWhere.createdAt = {};
      if (dateFrom) (baseWhere.createdAt as Record<string, Date>).gte = dateFrom;
      if (dateTo) (baseWhere.createdAt as Record<string, Date>).lte = dateTo;
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel using tenant-scoped Prisma
    const [leads, total] = await Promise.all([
      typedCtx.prismaWithTenant.lead.findMany({
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
      typedCtx.prismaWithTenant.lead.count({ where }),
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
   * Update a lead using LeadService
   */
  update: tenantProcedure.input(updateLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { id, ...data } = input;

    // Use service for updates that have business rules
    if (data.firstName || data.lastName || data.company || data.title || data.phone) {
      const leadService = getLeadService(ctx);

      const result = await leadService.updateLeadContactInfo(id, {
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        title: data.title,
        phone: data.phone?.value,
      });

      if (result.isFailure) {
        throw new TRPCError({
          code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      return mapLeadToResponse(result.value);
    }

    // For other updates (status changes handled separately), use Prisma directly
    const existingLead = await typedCtx.prismaWithTenant.lead.findUnique({
      where: { id },
    });

    if (!existingLead) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Lead with ID ${id} not found`,
      });
    }

    // Extract phone value if present (should not happen in this branch but TypeScript doesn't know)
    const { phone, ...restData } = data;
    const updateData: Record<string, any> = { ...restData };
    if (phone) {
      // Phone is a PhoneNumber value object, extract the string value
      updateData.phone = (phone as any).value;
    }

    const lead = await typedCtx.prismaWithTenant.lead.update({
      where: { id },
      data: updateData,
    });

    return lead;
  }),

  /**
   * Delete a lead using LeadService
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const result = await leadService.deleteLead(input.id);

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

    return { success: true, id: input.id };
  }),

  /**
   * Qualify a lead using LeadService
   */
  qualify: tenantProcedure.input(qualifyLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const result = await leadService.qualifyLead(
      input.leadId,
      typedCtx.tenant.userId,
      input.reason ?? 'Manual qualification'
    );

    if (result.isFailure) {
      const errorMessage = result.error.message;

      if (errorMessage.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: errorMessage,
        });
      }

      if (errorMessage.includes('already qualified') || errorMessage.includes('below minimum')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorMessage,
        });
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      });
    }

    return mapLeadToResponse(result.value);
  }),

  /**
   * Convert a lead to a contact using LeadService
   */
  convert: tenantProcedure.input(convertLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const result = await leadService.convertLead(
      input.leadId,
      input.createAccount ? (input.accountName ?? null) : null,
      typedCtx.tenant.userId
    );

    if (result.isFailure) {
      const errorMessage = result.error.message;

      if (errorMessage.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: errorMessage,
        });
      }

      if (errorMessage.includes('already converted') || errorMessage.includes('Only qualified')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorMessage,
        });
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      });
    }

    return result.value;
  }),

  /**
   * AI Score endpoint using LeadService
   */
  scoreWithAI: tenantProcedure
    .input(z.object({ leadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const leadService = getLeadService(ctx);

      const result = await leadService.scoreLead(input.leadId);

      if (result.isFailure) {
        if (result.error.message.includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: result.error.message,
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }

      return {
        leadId: result.value.leadId,
        previousScore: result.value.previousScore,
        score: result.value.newScore,
        confidence: result.value.confidence,
        tier: result.value.tier,
        autoQualified: result.value.autoQualified,
        autoDisqualified: result.value.autoDisqualified,
      };
    }),

  /**
   * Get lead statistics
   * Returns tenant-wide statistics (IFC-127: properly isolated by tenant)
   *
   * FIXME: Temporarily using protectedProcedure instead of tenantProcedure
   * because RLS is not fully configured yet. Switch back to tenantProcedure
   * when RLS policies are properly set up.
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user?.tenantId;

    if (!tenantId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Tenant ID not found',
      });
    }

    // Get total count and counts by status
    const [total, byStatus, leads] = await Promise.all([
      ctx.prisma.lead.count({ where: { tenantId } }),
      ctx.prisma.lead.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      ctx.prisma.lead.findMany({
        where: { tenantId },
        select: { score: true },
      }),
    ]);

    // Calculate score-based metrics
    const hotLeads = leads.filter(l => l.score >= 70).length;
    const warmLeads = leads.filter(l => l.score >= 40 && l.score < 70).length;
    const coldLeads = leads.filter(l => l.score < 40).length;

    const totalScore = leads.reduce((sum, l) => sum + l.score, 0);
    const averageScore = leads.length > 0 ? Math.round((totalScore / leads.length) * 100) / 100 : 0;

    const result = {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      averageScore,
      hotLeads,
      warmLeads,
      coldLeads,
    };

    return result;
  }),

  /**
   * Get hot leads using LeadService
   */
  getHotLeads: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const leads = await leadService.getHotLeads(typedCtx.tenant.userId);
    return leads.map(mapLeadToResponse);
  }),

  /**
   * Get leads ready for qualification using LeadService
   */
  getReadyForQualification: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const leadService = getLeadService(ctx);

    const leads = await leadService.getLeadsReadyForQualification(typedCtx.tenant.userId);
    return leads.map(mapLeadToResponse);
  }),

  /**
   * Bulk score leads using LeadService
   */
  bulkScore: tenantProcedure
    .input(z.object({ leadIds: z.array(idSchema) }))
    .mutation(async ({ ctx, input }) => {
      const leadService = getLeadService(ctx);

      const result = await leadService.bulkScoreLeads(input.leadIds);
      return result;
    }),
});
