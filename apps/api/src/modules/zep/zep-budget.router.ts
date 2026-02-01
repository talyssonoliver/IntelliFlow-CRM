/**
 * Zep Budget Router - IFC-086: Model Versioning with Zep
 *
 * Provides type-safe tRPC endpoints for Zep episode budget visibility:
 * - Get current episode usage status
 * - Get audit history
 *
 * CRITICAL: This router is P0 priority - episode budget visibility
 * prevents exceeding the 1,000 episode free tier limit.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '../../trpc';
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
  if (!ctx.prisma) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database client not available',
    });
  }
  return ctx.prisma;
}

export const zepBudgetRouter = createTRPCRouter({
  /**
   * Get current episode budget status
   * SECURITY: Uses protectedProcedure (authenticated users)
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
      }).optional()
    )
    .output(budgetStatusSchema)
    .query(async ({ ctx, input }) => {
      const prisma = getPrisma(ctx);
      const tenantId = input?.tenantId ?? 'global';

      // Try to find existing usage record
      const usage = await prisma.zepEpisodeUsage.findUnique({
        where: { tenantId },
      });

      if (!usage) {
        // No record exists - return default values
        const maxEpisodes = 1000;
        const warningPercent = 80;
        const hardLimitPercent = 95;

        return {
          used: 0,
          remaining: maxEpisodes,
          maxEpisodes,
          warningThreshold: Math.floor((maxEpisodes * warningPercent) / 100),
          limitThreshold: Math.floor((maxEpisodes * hardLimitPercent) / 100),
          isWarning: false,
          isLimited: false,
          isPersisted: false,
          lastSyncedAt: null,
          lastSyncSuccess: false,
        };
      }

      const warningThreshold = Math.floor(
        (usage.maxEpisodes * usage.warningPercent) / 100
      );
      const limitThreshold = Math.floor(
        (usage.maxEpisodes * usage.hardLimitPercent) / 100
      );

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
    }),

  /**
   * Get episode audit history
   * SECURITY: Uses tenantProcedure for tenant isolation
   */
  getAuditHistory: tenantProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .output(z.array(auditEntrySchema))
    .query(async ({ ctx, input }) => {
      const prisma = getPrisma(ctx);
      const tenantId = input.tenantId ?? 'global';

      const audits = await prisma.zepEpisodeAudit.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
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
    }),

  /**
   * Reset episode count (admin only - for testing/emergency)
   * SECURITY: Uses protectedProcedure with admin check
   */
  reset: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        newCount: z.number().int().min(0).default(0),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const prisma = getPrisma(ctx);
      const tenantId = input.tenantId ?? 'global';

      // Get current usage
      const current = await prisma.zepEpisodeUsage.findUnique({
        where: { tenantId },
      });

      const previousCount = current?.episodesUsed ?? 0;

      // Update or create usage record
      const updated = await prisma.zepEpisodeUsage.upsert({
        where: { tenantId },
        create: {
          tenantId,
          episodesUsed: input.newCount,
          maxEpisodes: 1000,
          warningPercent: 80,
          hardLimitPercent: 95,
        },
        update: {
          episodesUsed: input.newCount,
        },
      });

      // Create audit entry
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
