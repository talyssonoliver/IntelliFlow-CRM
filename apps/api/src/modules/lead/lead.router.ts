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
import { withTransactionOptions } from '@intelliflow/db';
import {
  createLeadSchema,
  updateLeadSchema,
  leadQuerySchema,
  qualifyLeadSchema,
  convertLeadSchema,
  convertLeadToDealSchema,
  idSchema,
} from '@intelliflow/validators/lead';
import {
  bulkConvertLeadsSchema,
  bulkUpdateLeadStatusSchema,
  bulkArchiveLeadsSchema,
  bulkDeleteLeadsSchema,
} from '@intelliflow/validators';
import { mapLeadToResponse } from '../../shared/mappers';
import type { Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext,
} from '../../security/tenant-context';
import { detectScoreBias, type LeadScoringBiasCheck } from '@intelliflow/adapters';

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

/**
 * Run a lightweight bias check on recently scored leads.
 * This keeps IFC-125 bias detection on an active runtime path.
 */
async function runBiasDetectionForScoredLeads(
  tenantCtx: TenantAwareContext,
  leadIds: string[] | undefined
): Promise<void> {
  if (!leadIds || leadIds.length === 0) return;

  try {
    const leads = await tenantCtx.prismaWithTenant.lead.findMany({
      where: { id: { in: leadIds } },
      select: {
        id: true,
        score: true,
        email: true,
        title: true,
        company: true,
        source: true,
      },
    });

    if (leads.length === 0) return;

    const samples: LeadScoringBiasCheck[] = leads.map((lead) => ({
      leadId: lead.id,
      score: lead.score ?? 0,
      metadata: {
        emailDomain: lead.email,
        jobTitle: lead.title ?? undefined,
        company: lead.company ?? undefined,
        source: lead.source ?? undefined,
      },
    }));

    const { biasDetected, violations } = detectScoreBias(samples);
    if (biasDetected) {
      console.warn('[BIAS] Lead scoring variance detected', {
        leadCount: samples.length,
        violations: violations.map((violation) => ({
          segment: violation.segment,
          metric: violation.metric,
          severity: violation.severity,
          actual: violation.actual,
          threshold: violation.threshold,
        })),
      });
    }
  } catch (error) {
    console.warn('[BIAS] Failed to run lead scoring bias check', error);
  }
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
   * Get a single lead by ID with full Lead 360 data
   * Returns lead with owner, activities, notes, files, AI insights, and tasks
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const lead = await typedCtx.prismaWithTenant.lead.findUnique({
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
        // Lead 360: Activities timeline
        activities: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        // Lead 360: Notes
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        // Lead 360: Files
        files: {
          orderBy: { uploadedAt: 'desc' },
        },
        aiInsight: true,
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
          take: 10,
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
   * Convert a lead to a deal/opportunity (IFC-062)
   * Creates Opportunity at PROSPECTING/10%, links Account, optionally creates Contact
   */
  convertToDeal: tenantProcedure
    .input(convertLeadToDealSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const useCase = ctx.services?.convertLeadToDeal;
      if (!useCase) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'ConvertLeadToDeal service not available',
        });
      }

      const result = await useCase.execute({
        ...input,
        convertedBy: typedCtx.tenant.userId,
      });

      if (result.isFailure) {
        const msg = result.error.message;
        if (msg.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: msg });
        }
        if (msg.includes('already converted') || msg.includes('Only qualified')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: msg });
        }
        if (msg.includes('required') || msg.includes('must be') || msg.includes('greater than')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: msg });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg });
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
   * Returns statistics filtered by user role (consistent with list procedure)
   *
   * SECURITY: Uses tenantProcedure and createTenantWhereClause for proper isolation
   * - ADMIN: sees all leads in tenant
   * - MANAGER: sees their own + team members' leads
   * - SALES_REP: sees only their own leads
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);

    // Use same filtering as list procedure for consistency
    const where = createTenantWhereClause(typedCtx.tenant, {});

    // Get total count and counts by status
    const [total, byStatus, leads] = await Promise.all([
      typedCtx.prismaWithTenant.lead.count({ where }),
      typedCtx.prismaWithTenant.lead.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      typedCtx.prismaWithTenant.lead.findMany({
        where,
        select: { score: true },
      }),
    ]);

    // Calculate score-based metrics
    const hotLeads = leads.filter((l) => l.score >= 70).length;
    const warmLeads = leads.filter((l) => l.score >= 40 && l.score < 70).length;
    const coldLeads = leads.filter((l) => l.score < 40).length;

    const totalScore = leads.reduce((sum, l) => sum + l.score, 0);
    const averageScore = leads.length > 0 ? Math.round((totalScore / leads.length) * 100) / 100 : 0;

    const result = {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
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
      const typedCtx = getTenantContext(ctx);
      const leadService = getLeadService(ctx);

      const result = await leadService.bulkScoreLeads(input.leadIds);

      // IFC-125: run bias detection on scored leads in active request flow.
      await runBiasDetectionForScoredLeads(typedCtx, result.successful);

      return result;
    }),

  /**
   * Get filter options with counts
   *
   * Returns available filter values with count of matching records.
   * Used for dynamic filters that hide options with 0 matches.
   */
  filterOptions: tenantProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.array(z.string()).optional(),
          source: z.array(z.string()).optional(),
          ownerId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Build base where clause with current filters
      const baseWhere: Record<string, unknown> = {};

      if (input?.search) {
        baseWhere.OR = [
          { email: { contains: input.search, mode: 'insensitive' } },
          { firstName: { contains: input.search, mode: 'insensitive' } },
          { lastName: { contains: input.search, mode: 'insensitive' } },
          { company: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input?.status && input.status.length > 0) {
        baseWhere.status = { in: input.status };
      }

      if (input?.source && input.source.length > 0) {
        baseWhere.source = { in: input.source };
      }

      if (input?.ownerId) {
        baseWhere.ownerId = input.ownerId;
      }

      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      // Get counts for each filter option
      const [statusCounts, sourceCounts, ownerCounts] = await Promise.all([
        typedCtx.prismaWithTenant.lead.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.lead.groupBy({
          by: ['source'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.lead.groupBy({
          by: ['ownerId'],
          where,
          _count: true,
        }),
      ]);

      // Get owner names for display
      const ownerIds = ownerCounts.map((o) => o.ownerId).filter(Boolean) as string[];
      const owners =
        ownerIds.length > 0
          ? await ctx.prisma.user.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const ownerMap = new Map(owners.map((o) => [o.id, o.name || o.email]));

      return {
        statuses: statusCounts.map((s) => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
        sources: sourceCounts.map((s) => ({
          value: s.source,
          label: s.source,
          count: s._count,
        })),
        owners: ownerCounts
          .filter((o) => o.ownerId)
          .map((o) => ({
            value: o.ownerId as string,
            label: ownerMap.get(o.ownerId as string) || o.ownerId,
            count: o._count,
          })),
      };
    }),

  /**
   * Bulk convert leads to contacts
   * IFC-007: Optimized to use batch operations O(1) instead of O(n) sequential
   */
  bulkConvert: tenantProcedure.input(bulkConvertLeadsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids, createAccounts } = input;

    // IFC-007: Use batch operation via transaction
    // Replaces O(n) sequential calls with O(1) batch queries
    return await typedCtx.prismaWithTenant.$transaction(async (tx) => {
      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      // Fetch all leads in single query
      const leads = await tx.lead.findMany({
        where: { id: { in: ids }, tenantId: typedCtx.tenant.tenantId },
      });
      const existingIds = new Set(leads.map((l) => l.id));

      // Track non-existent leads
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Filter valid leads for conversion
      const validLeads = leads.filter((l) => l.status !== 'CONVERTED');
      const alreadyConverted = leads.filter((l) => l.status === 'CONVERTED');

      for (const lead of alreadyConverted) {
        failed.push({ id: lead.id, error: 'Lead already converted' });
      }

      if (validLeads.length === 0) {
        return { successful, failed, totalProcessed: ids.length };
      }

      // Batch update lead statuses
      await tx.lead.updateMany({
        where: { id: { in: validLeads.map((l) => l.id) } },
        data: { status: 'CONVERTED', updatedAt: new Date() },
      });

      // Batch create contacts
      await tx.contact.createMany({
        data: validLeads.map((lead) => ({
          firstName: lead.firstName || 'Unknown',
          lastName: lead.lastName || 'Unknown',
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          title: lead.title,
          tenantId: lead.tenantId,
          ownerId: lead.ownerId || typedCtx.tenant.userId,
          createdBy: typedCtx.tenant.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });

      // Optionally create accounts
      if (createAccounts) {
        const leadsWithCompany = validLeads.filter((l) => l.company);
        if (leadsWithCompany.length > 0) {
          await tx.account.createMany({
            data: leadsWithCompany.map((lead) => ({
              name: lead.company!,
              tenantId: lead.tenantId,
              ownerId: lead.ownerId || typedCtx.tenant.userId,
              createdBy: typedCtx.tenant.userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }

      successful.push(...validLeads.map((l) => l.id));
      return { successful, failed, totalProcessed: ids.length };
    });
  }),

  /**
   * Bulk update lead status
   * IFC-007: Optimized to use batch operations O(1) instead of O(n) sequential
   */
  bulkUpdateStatus: tenantProcedure
    .input(bulkUpdateLeadStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { ids, status } = input;

      // IFC-007: Use batch operation
      // Replaces O(n) sequential calls with O(1) batch queries
      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      try {
        // Verify which leads exist
        const existingLeads = await typedCtx.prismaWithTenant.lead.findMany({
          where: { id: { in: ids }, tenantId: typedCtx.tenant.tenantId },
          select: { id: true },
        });
        const existingIds = new Set(existingLeads.map((l) => l.id));

        // Track non-existent IDs
        for (const id of ids) {
          if (!existingIds.has(id)) {
            failed.push({ id, error: 'Lead not found' });
          }
        }

        // Batch update existing leads
        const idsToUpdate = ids.filter((id) => existingIds.has(id));
        if (idsToUpdate.length > 0) {
          await typedCtx.prismaWithTenant.lead.updateMany({
            where: { id: { in: idsToUpdate } },
            data: { status, updatedAt: new Date() },
          });
          successful.push(...idsToUpdate);
        }
      } catch (error) {
        // If batch update fails, all remaining IDs fail
        for (const id of ids) {
          if (!failed.find((f) => f.id === id) && !successful.includes(id)) {
            failed.push({
              id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      return { successful, failed, totalProcessed: ids.length };
    }),

  /**
   * Bulk archive leads (set status to LOST)
   * IFC-007: Optimized to use batch operations O(1) instead of O(n) sequential
   */
  bulkArchive: tenantProcedure.input(bulkArchiveLeadsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids } = input;

    // IFC-007: Use batch operation (reuses bulkUpdateStatus logic)
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      // Verify which leads exist
      const existingLeads = await typedCtx.prismaWithTenant.lead.findMany({
        where: { id: { in: ids }, tenantId: typedCtx.tenant.tenantId },
        select: { id: true },
      });
      const existingIds = new Set(existingLeads.map((l) => l.id));

      // Track non-existent IDs
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Batch update existing leads to LOST status
      const idsToUpdate = ids.filter((id) => existingIds.has(id));
      if (idsToUpdate.length > 0) {
        await typedCtx.prismaWithTenant.lead.updateMany({
          where: { id: { in: idsToUpdate } },
          data: { status: 'LOST', updatedAt: new Date() },
        });
        successful.push(...idsToUpdate);
      }
    } catch (error) {
      for (const id of ids) {
        if (!failed.find((f) => f.id === id) && !successful.includes(id)) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { successful, failed, totalProcessed: ids.length };
  }),

  /**
   * Bulk delete leads
   * IFC-007: Optimized to use batch operations O(1) instead of O(n) sequential
   */
  bulkDelete: tenantProcedure.input(bulkDeleteLeadsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids } = input;

    // IFC-007: Use batch operation
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      // Verify which leads exist before deletion
      const existingLeads = await typedCtx.prismaWithTenant.lead.findMany({
        where: { id: { in: ids }, tenantId: typedCtx.tenant.tenantId },
        select: { id: true },
      });
      const existingIds = new Set(existingLeads.map((l) => l.id));

      // Track non-existent IDs
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Batch delete existing leads
      const idsToDelete = ids.filter((id) => existingIds.has(id));
      if (idsToDelete.length > 0) {
        await typedCtx.prismaWithTenant.lead.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        successful.push(...idsToDelete);
      }
    } catch (error) {
      for (const id of ids) {
        if (!failed.find((f) => f.id === id) && !successful.includes(id)) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { successful, failed, totalProcessed: ids.length };
  }),
});
