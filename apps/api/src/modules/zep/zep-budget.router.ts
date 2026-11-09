/**
 * Zep Budget Router - IFC-086: Model Versioning with Zep
 *
 * Provides type-safe tRPC endpoints for Zep episode budget visibility:
 * - Get current episode usage status
 * - Get audit history
 *
 * CRITICAL: This router is P0 priority - episode budget visibility
 * prevents exceeding the 1,000 episode free tier limit.
 *
 * Tenant scoping: a tenant user always reads their own tenant's budget, taken from the
 * session; naming another tenant is refused. The platform-wide budget ('global') and other
 * tenants are read, and any budget reset, only through platformAdminProcedure (ADR-070).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, platformAdminProcedure, tenantProcedure } from '../../trpc';
import type { Context } from '../../context';

/**
 * Budget status response schema
 */
const budgetStatusSchema = z.object({
  used: z.number(),
  remaining: z.number(),
  maxEpisodes: z.number(),
  warningThreshold: z.number(),
  limitThreshold: z.number(),
  isWarning: z.boolean(),
  isLimited: z.boolean(),
  isPersisted: z.boolean(),
  lastSyncedAt: z.date().nullable(),
  lastSyncSuccess: z.boolean(),
});

/**
 * Audit entry schema
 */
const auditEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  previousCount: z.number(),
  newCount: z.number(),
  delta: z.number(),
  operation: z.string(),
  sessionId: z.string().nullable(),
  createdAt: z.date(),
});

/**
 * Helper to get Prisma client from context
 */
function getPrisma(ctx: Context) {
  const client = ctx.prismaWithTenant ?? ctx.prisma;
  if (!client) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database client not available',
    });
  }
  return client;
}

type Db = ReturnType<typeof getPrisma>;

const DEFAULT_MAX_EPISODES = 1000;
const DEFAULT_WARNING_PERCENT = 80;
const DEFAULT_HARD_LIMIT_PERCENT = 95;

/** The budget status of `tenantId` ('global' for the platform-wide budget). */
async function readStatus(
  prisma: Db,
  tenantId: string
): Promise<z.infer<typeof budgetStatusSchema>> {
  const usage = await prisma.zepEpisodeUsage.findUnique({ where: { tenantId } });

  if (!usage) {
    return {
      used: 0,
      remaining: DEFAULT_MAX_EPISODES,
      maxEpisodes: DEFAULT_MAX_EPISODES,
      warningThreshold: Math.floor((DEFAULT_MAX_EPISODES * DEFAULT_WARNING_PERCENT) / 100),
      limitThreshold: Math.floor((DEFAULT_MAX_EPISODES * DEFAULT_HARD_LIMIT_PERCENT) / 100),
      isWarning: false,
      isLimited: false,
      isPersisted: false,
      lastSyncedAt: null,
      lastSyncSuccess: false,
    };
  }

  const warningThreshold = Math.floor((usage.maxEpisodes * usage.warningPercent) / 100);
  const limitThreshold = Math.floor((usage.maxEpisodes * usage.hardLimitPercent) / 100);

  return {
    used: usage.episodesUsed,
    remaining: usage.maxEpisodes - usage.episodesUsed,
    maxEpisodes: usage.maxEpisodes,
    warningThreshold,
    limitThreshold,
    isWarning: usage.episodesUsed >= warningThreshold,
    isLimited: usage.episodesUsed >= limitThreshold,
    isPersisted: true,
    lastSyncedAt: usage.lastSyncedAt,
    lastSyncSuccess: usage.lastSyncSuccess,
  };
}

/** The newest audit entries of `tenantId`. */
async function readAudit(
  prisma: Db,
  tenantId: string,
  limit: number
): Promise<z.infer<typeof auditEntrySchema>[]> {
  const audits = await prisma.zepEpisodeAudit.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return audits.map((audit) => ({
    id: audit.id,
    tenantId: audit.tenantId,
    previousCount: audit.previousCount,
    newCount: audit.newCount,
    delta: audit.delta,
    operation: audit.operation,
    sessionId: audit.sessionId,
    createdAt: audit.createdAt,
  }));
}

/**
 * The caller's own tenant. A `tenantId` in the input is accepted only when it is that same
 * tenant (older clients send it); any other value is refused.
 */
function ownTenant(ctx: Context, requested: string | undefined): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context required' });
  }
  if (requested !== undefined && requested !== tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "Only your own tenant's budget can be read here",
    });
  }
  return tenantId;
}

const platformTenantInput = z
  .object({
    /** Defaults to the platform-wide budget. */
    tenantId: z.string().min(1).default('global'),
  })
  .default({ tenantId: 'global' });

export const zepBudgetRouter = createTRPCRouter({
  /**
   * The caller's tenant episode budget.
   */
  getStatus: tenantProcedure
    .input(z.object({ tenantId: z.string().optional() }).optional())
    .output(budgetStatusSchema)
    .query(async ({ ctx, input }) => readStatus(getPrisma(ctx), ownTenant(ctx, input?.tenantId))),

  /**
   * The caller's tenant episode audit history.
   */
  getAuditHistory: tenantProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .output(z.array(auditEntrySchema))
    .query(async ({ ctx, input }) =>
      readAudit(getPrisma(ctx), ownTenant(ctx, input.tenantId), input.limit)
    ),

  /**
   * Platform operators: the budget of the platform ('global', the default) or of any tenant.
   */
  getPlatformStatus: platformAdminProcedure
    .input(platformTenantInput)
    .output(budgetStatusSchema)
    .query(async ({ ctx, input }) => readStatus(getPrisma(ctx), input.tenantId)),

  /**
   * Platform operators: the audit history of the platform ('global', the default) or of any tenant.
   */
  getPlatformAuditHistory: platformAdminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).default('global'),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .output(z.array(auditEntrySchema))
    .query(async ({ ctx, input }) => readAudit(getPrisma(ctx), input.tenantId, input.limit)),

  /**
   * Reset an episode count (testing / emergency). Platform operators only: the budget it
   * changes is the platform's ('global', the default) or any tenant's.
   */
  reset: platformAdminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).default('global'),
        newCount: z.number().int().min(0).default(0),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const prisma = getPrisma(ctx);
      const tenantId = input.tenantId;

      const current = await prisma.zepEpisodeUsage.findUnique({
        where: { tenantId },
      });

      const previousCount = current?.episodesUsed ?? 0;

      const updated = await prisma.zepEpisodeUsage.upsert({
        where: { tenantId },
        create: {
          tenantId,
          episodesUsed: input.newCount,
          maxEpisodes: DEFAULT_MAX_EPISODES,
          warningPercent: DEFAULT_WARNING_PERCENT,
          hardLimitPercent: DEFAULT_HARD_LIMIT_PERCENT,
        },
        update: {
          episodesUsed: input.newCount,
        },
      });

      await prisma.zepEpisodeAudit.create({
        data: {
          tenantId,
          previousCount,
          newCount: input.newCount,
          delta: input.newCount - previousCount,
          operation: `RESET: ${input.reason}`,
        },
      });

      return {
        success: true,
        previousCount,
        newCount: updated.episodesUsed,
      };
    }),
});
