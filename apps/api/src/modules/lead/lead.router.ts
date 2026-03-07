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
import { Prisma } from '@intelliflow/db';
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '../../trpc';
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
import { createNotification } from '../notifications/notifications.router';
import { deriveLeadInsights } from '../../shared/lead-insight-deriver';

function buildNumberRange(
  min: number | undefined,
  max: number | undefined
): Record<string, number> | undefined {
  if (min === undefined && max === undefined) return undefined;
  const r: Record<string, number> = {};
  if (min !== undefined) r.gte = min;
  if (max !== undefined) r.lte = max;
  return r;
}

function buildDateRange(
  from: Date | undefined,
  to: Date | undefined
): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const r: Record<string, Date> = {};
  if (from) r.gte = from;
  if (to) r.lte = to;
  return r;
}

/**
 * Build the base WHERE clause for the leads list query.
 * Extracted to reduce cognitive complexity of the list procedure.
 */
function buildLeadListWhere(filters: {
  status?: string[];
  source?: string[];
  minScore?: number;
  maxScore?: number;
  search?: string;
  ownerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Record<string, unknown> {
  const { status, source, minScore, maxScore, search, ownerId, dateFrom, dateTo } = filters;
  const baseWhere: Record<string, unknown> = {};

  if (status && status.length > 0) baseWhere.status = { in: status };
  if (source && source.length > 0) baseWhere.source = { in: source };

  const scoreRange = buildNumberRange(minScore, maxScore);
  if (scoreRange) baseWhere.score = scoreRange;

  if (search) {
    baseWhere.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (ownerId) baseWhere.ownerId = ownerId;

  const dateRange = buildDateRange(dateFrom, dateTo);
  if (dateRange) baseWhere.createdAt = dateRange;

  return baseWhere;
}

/**
 * Mark IDs missing from existing set as failed.
 */
function collectMissingLeads(
  ids: string[],
  existingIds: Set<string>,
  failed: Array<{ id: string; error: string }>
): void {
  for (const id of ids) {
    if (!existingIds.has(id)) {
      failed.push({ id, error: 'Lead not found' });
    }
  }
}

/**
 * Mark already-converted leads as failed.
 */
function collectAlreadyConvertedLeads(
  alreadyConverted: Array<{ id: string }>,
  failed: Array<{ id: string; error: string }>
): void {
  for (const lead of alreadyConverted) {
    failed.push({ id: lead.id, error: 'Lead already converted' });
  }
}

/**
 * Build activity log rows for bulk lead conversion.
 */
function buildConversionActivityData(
  validLeads: Array<{ id: string; status: string; tenantId: string }>,
  userId: string,
  userEmail: string
): Array<Record<string, unknown>> {
  const now = new Date();
  return validLeads.map((lead) => ({
    type: 'STATUS_CHANGE' as const,
    title: 'Lead Converted',
    description: 'Status changed from non-CONVERTED to CONVERTED',
    timestamp: now,
    userId,
    userName: userEmail,
    leadId: lead.id,
    tenantId: lead.tenantId,
    metadata: { oldStatus: lead.status, newStatus: 'CONVERTED', bulk: true },
  }));
}

/**
 * Build contact creation data from valid leads.
 */
function buildContactDataFromLeads(
  validLeads: Array<{
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    tenantId: string;
    ownerId: string | null;
  }>,
  fallbackUserId: string
): Array<Record<string, unknown>> {
  return validLeads.map((lead) => ({
    firstName: lead.firstName || 'Unknown',
    lastName: lead.lastName || 'Unknown',
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    title: lead.title,
    tenantId: lead.tenantId,
    ownerId: lead.ownerId || fallbackUserId,
    createdBy: fallbackUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/**
 * Build account creation data from leads that have a company name.
 */
function buildAccountDataFromLeads(
  leads: Array<{ company: string | null; tenantId: string; ownerId: string | null }>,
  fallbackUserId: string
): Array<Record<string, unknown>> {
  return leads
    .filter((l) => l.company)
    .map((lead) => ({
      name: lead.company!,
      tenantId: lead.tenantId,
      ownerId: lead.ownerId || fallbackUserId,
      createdBy: fallbackUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
}

/**
 * Persist bulk status activity rows, logging failures without blocking.
 */
async function persistBulkStatusActivityRows(
  prisma: { leadActivity: { createMany: (args: { data: any }) => Promise<unknown> } },
  activityRows: Array<Record<string, unknown>>,
  context: string
): Promise<void> {
  if (activityRows.length === 0) return;
  try {
    await prisma.leadActivity.createMany({ data: activityRows as any });
  } catch (error) {
    console.warn(`[lead.${context}] Failed to persist activity rows`, {
      count: activityRows.length,
      error,
    });
  }
}

/**
 * Build activity rows for bulk status change operations.
 */
function buildBulkStatusActivityRows(
  leads: Array<{ id: string; status: string }>,
  idsToUpdate: string[],
  newStatus: string,
  tenantId: string,
  userId: string,
  userEmail: string,
  title: string
): Array<Record<string, unknown>> {
  const now = new Date();
  return leads
    .filter((lead) => idsToUpdate.includes(lead.id) && lead.status !== newStatus)
    .map((lead) => ({
      type: 'STATUS_CHANGE' as const,
      title,
      description: `Status changed from ${lead.status} to ${newStatus}`,
      timestamp: now,
      userId,
      userName: userEmail,
      leadId: lead.id,
      tenantId,
      metadata: { oldStatus: lead.status, newStatus, bulk: true },
    }));
}

/**
 * Collect failures for IDs that were not yet processed.
 */
function collectBulkFailures(
  ids: string[],
  failed: Array<{ id: string; error: string }>,
  successful: string[],
  error: unknown
): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  for (const id of ids) {
    if (!failed.find((f) => f.id === id) && !successful.includes(id)) {
      failed.push({ id, error: errorMessage });
    }
  }
}

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

type LeadActivityLogType =
  | 'WEB_FORM'
  | 'EMAIL'
  | 'CALL'
  | 'MEETING'
  | 'NOTE'
  | 'SCORE_UPDATE'
  | 'STATUS_CHANGE'
  | 'QUALIFICATION';

/**
 * Best-effort system activity logging for lead lifecycle actions.
 * Activity write failures must not block the primary business operation.
 */
async function writeLeadActivityLog(
  ctx: Context,
  input: {
    leadId: string;
    tenantId: string;
    type: LeadActivityLogType;
    title: string;
    description?: string;
    metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    userId?: string;
    userName?: string;
    timestamp?: Date;
  }
): Promise<void> {
  try {
    await ctx.prisma.leadActivity.create({
      data: {
        type: input.type,
        title: input.title,
        description: input.description ?? '',
        metadata: input.metadata,
        timestamp: input.timestamp ?? new Date(),
        userId: input.userId,
        userName: input.userName ?? 'System',
        leadId: input.leadId,
        tenantId: input.tenantId,
      },
    });
  } catch (error) {
    console.warn('[lead.activity] Failed to persist lead activity log', {
      leadId: input.leadId,
      type: input.type,
      error,
    });
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

    await writeLeadActivityLog(ctx, {
      leadId: result.value.id.value,
      tenantId: typedCtx.tenant.tenantId,
      type: 'NOTE',
      title: 'Lead Created',
      description: `Lead created from source: ${input.source}`,
      metadata: { source: input.source },
      userId: typedCtx.tenant.userId,
      userName: ctx.user?.email ?? 'System',
    });

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
            role: true,
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

    // Derive AI insights when none exist in DB (ensures entity pages always show data)
    if (!lead.aiInsight) {
      const derived = deriveLeadInsights({
        score: lead.score ?? 0,
        confidence: 0.5,
        source: lead.source ?? 'OTHER',
        title: lead.title,
        company: lead.company,
        estimatedValue: lead.estimatedValue,
        status: lead.status,
        lastContactedAt: lead.lastContactedAt,
        createdAt: lead.createdAt,
      });

      const syntheticInsight = {
        id: `derived-${lead.id}`,
        leadId: lead.id,
        tenantId: typedCtx.tenant.tenantId,
        ...derived,
        recommendations: derived.recommendations as unknown,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Fire-and-forget: persist so future visits read from DB
      ctx.prisma.leadAIInsight
        ?.upsert({
          where: { leadId: lead.id },
          create: {
            leadId: lead.id,
            tenantId: typedCtx.tenant.tenantId,
            ...derived,
            recommendations: derived.recommendations,
          },
          update: {},
        })
        ?.catch(() => {}); // Best-effort persistence — silently ignore

      return { ...lead, aiInsight: syntheticInsight };
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

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, buildLeadListWhere({ status, source, minScore, maxScore, search, ownerId, dateFrom, dateTo }));

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
   * All editable fields go through the unified service method for consistent
   * domain validation, converted-lead protection, and event publishing.
   */
  update: tenantProcedure.input(updateLeadSchema).mutation(async ({ ctx, input }) => {
    const leadService = getLeadService(ctx);
    const { id, phone, ...rest } = input;

    const result = await leadService.updateLead(id, {
      ...rest,
      phone: phone?.value,
    });

    if (result.isFailure) {
      const msg = result.error.message;
      if (msg.includes('not found')) {
        throw new TRPCError({ code: 'NOT_FOUND', message: msg });
      }
      if (msg.includes('converted')) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: msg });
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message: msg });
    }

    return mapLeadToResponse(result.value);
  }),

  /**
   * Delete a lead using LeadService
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
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

    // Fire-and-forget: notification failure must not block the lead qualification response
    createNotification(ctx.prisma, {
      userId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'lead_converted',
      title: 'Lead qualified',
      body: `Lead has been qualified`,
      priority: 'normal',
      entityType: 'lead',
      entityId: input.leadId,
      actionUrl: `/leads/${input.leadId}`,
    }).catch(() => {}); // Swallow notification errors — non-critical side-effect

    await writeLeadActivityLog(ctx, {
      leadId: input.leadId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'QUALIFICATION',
      title: 'Lead Qualified',
      description: input.reason ?? 'Manual qualification',
      metadata: { qualifiedBy: typedCtx.tenant.userId },
      userId: typedCtx.tenant.userId,
      userName: ctx.user?.email ?? 'System',
    });

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

    await writeLeadActivityLog(ctx, {
      leadId: input.leadId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'STATUS_CHANGE',
      title: 'Lead Converted',
      description: 'Lead converted to contact',
      metadata: {
        convertedBy: typedCtx.tenant.userId,
        createAccount: input.createAccount,
        accountName: input.accountName ?? null,
      },
      userId: typedCtx.tenant.userId,
      userName: ctx.user?.email ?? 'System',
    });

    return result.value;
  }),

  /**
   * Convert a lead to a deal/opportunity (IFC-062)
   * Creates Opportunity at PROSPECTING/10%, links Account, optionally creates Contact
   */
  convertToDeal: tenantProcedure.input(convertLeadToDealSchema).mutation(async ({ ctx, input }) => {
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

    // Fire-and-forget: notification failure must not block the lead-to-deal conversion response
    createNotification(ctx.prisma, {
      userId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'lead_converted',
      title: 'Lead converted to deal',
      body: `Lead converted to deal "${input.dealName}"`,
      priority: 'high',
      entityType: 'lead',
      entityId: input.leadId,
      actionUrl: `/leads/${input.leadId}`,
    }).catch(() => {}); // Swallow notification errors — non-critical side-effect

    await writeLeadActivityLog(ctx, {
      leadId: input.leadId,
      tenantId: typedCtx.tenant.tenantId,
      type: 'STATUS_CHANGE',
      title: 'Lead Converted to Deal',
      description: `Lead converted to deal "${input.dealName ?? 'New opportunity'}"`,
      metadata: {
        convertedBy: typedCtx.tenant.userId,
        dealName: input.dealName ?? null,
        opportunityId: result.value.opportunityId,
      },
      userId: typedCtx.tenant.userId,
      userName: ctx.user?.email ?? 'System',
    });

    return result.value;
  }),

  /**
   * AI Score endpoint using LeadService
   */
  scoreWithAI: tenantProcedure
    .input(z.object({ leadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
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

      // Fire-and-forget: notification failure must not block the AI scoring response
      createNotification(ctx.prisma, {
        userId: ctx.user?.userId || 'system',
        tenantId: ctx.user?.tenantId || 'default',
        type: 'lead_scored',
        title: 'Lead scored by AI',
        body: `Lead scored ${result.value.newScore} (${result.value.tier})`,
        priority: 'normal',
        entityType: 'lead',
        entityId: result.value.leadId,
        actionUrl: `/leads/${result.value.leadId}`,
      }).catch(() => {}); // Swallow notification errors — non-critical side-effect

      await writeLeadActivityLog(ctx, {
        leadId: result.value.leadId,
        tenantId: typedCtx.tenant.tenantId,
        type: 'SCORE_UPDATE',
        title: 'Lead Scored by AI',
        description: `Score ${result.value.newScore} (${result.value.tier}) at ${(result.value.confidence * 100).toFixed(0)}% confidence`,
        metadata: {
          previousScore: result.value.previousScore,
          newScore: result.value.newScore,
          confidence: result.value.confidence,
          tier: result.value.tier,
          autoQualified: result.value.autoQualified,
          autoDisqualified: result.value.autoDisqualified,
        },
        userId: typedCtx.tenant.userId,
        userName: 'AI Scoring Agent',
      });

      // Fire-and-forget: populate LeadAIInsight so Lead IQ sidebar shows real data
      (async () => {
        try {
          const lead = await ctx.prisma.lead.findUnique({
            where: { id: input.leadId },
            select: {
              source: true,
              title: true,
              company: true,
              estimatedValue: true,
              status: true,
              lastContactedAt: true,
              createdAt: true,
            },
          });
          if (!lead) return;

          const insights = deriveLeadInsights({
            score: result.value.newScore,
            confidence: result.value.confidence,
            source: lead.source,
            title: lead.title,
            company: lead.company,
            estimatedValue: lead.estimatedValue,
            status: lead.status,
            lastContactedAt: lead.lastContactedAt,
            createdAt: lead.createdAt,
          });

          await ctx.prisma.leadAIInsight.upsert({
            where: { leadId: input.leadId },
            update: {
              ...insights,
              recommendations: insights.recommendations,
            },
            create: {
              leadId: input.leadId,
              tenantId: ctx.user?.tenantId || 'default',
              ...insights,
              recommendations: insights.recommendations,
            },
          });
        } catch (err) {
          console.warn('Failed to populate LeadAIInsight after scoring:', err);
        }
      })();

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
      const ownerIds = (ownerCounts ?? []).map((o) => o.ownerId).filter(Boolean) as string[];
      const owners =
        ownerIds.length > 0
          ? await ctx.prisma.user.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const ownerMap = new Map(owners.map((o) => [o.id, o.name || o.email]));

      return {
        statuses: (statusCounts ?? []).map((s) => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
        sources: (sourceCounts ?? []).map((s) => ({
          value: s.source,
          label: s.source,
          count: s._count,
        })),
        owners: (ownerCounts ?? [])
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

      collectMissingLeads(ids, existingIds, failed);

      const validLeads = leads.filter((l) => l.status !== 'CONVERTED');
      const alreadyConverted = leads.filter((l) => l.status === 'CONVERTED');
      collectAlreadyConvertedLeads(alreadyConverted, failed);

      if (validLeads.length === 0) {
        return { successful, failed, totalProcessed: ids.length };
      }

      await tx.lead.updateMany({
        where: { id: { in: validLeads.map((l) => l.id) } },
        data: { status: 'CONVERTED', updatedAt: new Date() },
      });

      const activityData = buildConversionActivityData(
        validLeads,
        typedCtx.tenant.userId,
        ctx.user?.email ?? 'System'
      );
      await tx.leadActivity.createMany({ data: activityData as any });

      const contactData = buildContactDataFromLeads(validLeads, typedCtx.tenant.userId);
      await tx.contact.createMany({ data: contactData as any, skipDuplicates: true });

      if (createAccounts) {
        const accountData = buildAccountDataFromLeads(validLeads, typedCtx.tenant.userId);
        if (accountData.length > 0) {
          await tx.account.createMany({ data: accountData as any, skipDuplicates: true });
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
          select: { id: true, status: true },
        });
        const existingIds = new Set(existingLeads.map((l) => l.id));

        collectMissingLeads(ids, existingIds, failed);

        // Batch update existing leads
        const idsToUpdate = ids.filter((id) => existingIds.has(id));
        if (idsToUpdate.length > 0) {
          await typedCtx.prismaWithTenant.lead.updateMany({
            where: { id: { in: idsToUpdate } },
            data: { status, updatedAt: new Date() },
          });
          successful.push(...idsToUpdate);

          const activityRows = buildBulkStatusActivityRows(
            existingLeads,
            idsToUpdate,
            status,
            typedCtx.tenant.tenantId,
            typedCtx.tenant.userId,
            ctx.user?.email ?? 'System',
            'Lead Status Changed'
          );

          await persistBulkStatusActivityRows(ctx.prisma, activityRows, 'bulkUpdateStatus');
        }
      } catch (error) {
        collectBulkFailures(ids, failed, successful, error);
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
        select: { id: true, status: true },
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

        const activityRows = buildBulkStatusActivityRows(
          existingLeads,
          idsToUpdate,
          'LOST',
          typedCtx.tenant.tenantId,
          typedCtx.tenant.userId,
          ctx.user?.email ?? 'System',
          'Lead Archived'
        );

        if (activityRows.length > 0) {
          try {
            await ctx.prisma.leadActivity.createMany({ data: activityRows as any });
          } catch (error) {
            console.warn('[lead.bulkArchive] Failed to persist activity rows', {
              count: activityRows.length,
              error,
            });
          }
        }
      }
    } catch (error) {
      collectBulkFailures(ids, failed, successful, error);
    }

    return { successful, failed, totalProcessed: ids.length };
  }),

  /**
   * Add a note to a lead
   */
  addNote: tenantProcedure
    .input(
      z.object({
        leadId: idSchema,
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: input.leadId },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead not found: ${input.leadId}`,
        });
      }

      const note = await ctx.prisma.leadNote.create({
        data: {
          content: input.content,
          author: ctx.user?.email ?? 'Unknown',
          leadId: input.leadId,
          tenantId: typedCtx.tenant.tenantId,
        },
      });

      return note;
    }),

  /**
   * Log an activity on a lead (updates lastContactedAt)
   */
  logActivity: tenantProcedure
    .input(
      z.object({
        leadId: idSchema,
        type: z.enum([
          'WEB_FORM',
          'EMAIL',
          'CALL',
          'MEETING',
          'NOTE',
          'SCORE_UPDATE',
          'STATUS_CHANGE',
          'QUALIFICATION',
        ]),
        title: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: input.leadId },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead not found: ${input.leadId}`,
        });
      }

      const now = new Date();

      // Transaction: create activity + update lastContactedAt
      const activity = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.leadActivity.create({
          data: {
            type: input.type,
            title: input.title,
            description: input.description ?? '',
            timestamp: now,
            userName: ctx.user?.email ?? 'Unknown',
            leadId: input.leadId,
            tenantId: typedCtx.tenant.tenantId,
          },
        });

        await tx.lead.update({
          where: { id: input.leadId },
          data: {
            lastContactedAt: now,
            updatedAt: now,
          },
        });

        return created;
      });

      return activity;
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
