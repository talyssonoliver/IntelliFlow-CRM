/**
 * Chain Version Router - IFC-086: Model Versioning with Zep
 *
 * Provides type-safe tRPC endpoints for chain version management:
 * - Create and manage chain versions
 * - Activate/deprecate/rollback versions
 * - Get version history and active configs
 * - A/B testing integration via experiments
 *
 * Uses ChainVersionService from application layer (hexagonal architecture)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, tenantProcedure, adminProcedure } from '../../trpc';
import {
  createChainVersionSchema,
  updateChainVersionSchema,
  activateVersionSchema,
  rollbackVersionSchema,
  chainTypeSchema,
  chainVersionStatusSchema,
} from '@intelliflow/validators';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';

/**
 * Helper to get chain version service with null check
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getChainVersionService(ctx: Context): any {
  if (!ctx.services?.chainVersion) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Chain version service not available',
    });
  }
  return ctx.services.chainVersion;
}

export const chainVersionRouter = createTRPCRouter({
  // ===========================================================================
  // Version Lifecycle
  // ===========================================================================

  /**
   * Create a new chain version
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  create: tenantProcedure
    .input(createChainVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const chainVersionService = getChainVersionService(ctx);

      return chainVersionService.createVersion({
        ...input,
        tenantId: typedCtx.tenant.tenantId,
        createdBy: typedCtx.tenant.userId,
      });
    }),

  /**
   * Update chain version (DRAFT only)
   * SECURITY: Uses tenantProcedure
   */
  update: tenantProcedure
    .input(
      z.object({
        versionId: z.string().uuid(),
        data: updateChainVersionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      return chainVersionService.updateVersion(input.versionId, input.data);
    }),

  /**
   * Activate a chain version (replaces current active)
   * SECURITY: Uses adminProcedure (elevated access)
   */
  activate: adminProcedure
    .input(activateVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.activateVersion(
        input.versionId,
        typedCtx.tenant.userId
      );
    }),

  /**
   * Deprecate a chain version
   * SECURITY: Uses adminProcedure
   */
  deprecate: adminProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.deprecateVersion(
        input.versionId,
        typedCtx.tenant.userId
      );
    }),

  /**
   * Archive a chain version
   * SECURITY: Uses adminProcedure
   */
  archive: adminProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.archiveVersion(
        input.versionId,
        typedCtx.tenant.userId
      );
    }),

  /**
   * Rollback to a previous version
   * SECURITY: Uses adminProcedure (critical operation)
   */
  rollback: adminProcedure
    .input(rollbackVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.rollbackToVersion(
        input.versionId,
        input.reason,
        typedCtx.tenant.userId
      );
    }),

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get chain version by ID
   * SECURITY: Uses tenantProcedure
   */
  getById: tenantProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      return chainVersionService.getVersion(input.versionId);
    }),

  /**
   * Get active version for a chain type
   * SECURITY: Uses tenantProcedure
   */
  getActive: tenantProcedure
    .input(
      z.object({
        chainType: chainTypeSchema,
        context: z
          .object({
            userId: z.string().optional(),
            sessionId: z.string().optional(),
            leadId: z.string().optional(),
            experimentId: z.string().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.getActiveVersion(input.chainType, {
        tenantId: typedCtx.tenant.tenantId,
        ...input.context,
      });
    }),

  /**
   * Get chain config for a chain type (simplified output)
   * SECURITY: Uses tenantProcedure
   */
  getConfig: tenantProcedure
    .input(
      z.object({
        chainType: chainTypeSchema,
        context: z
          .object({
            userId: z.string().optional(),
            sessionId: z.string().optional(),
            leadId: z.string().optional(),
            experimentId: z.string().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.getChainConfig(input.chainType, {
        tenantId: typedCtx.tenant.tenantId,
        ...input.context,
      });
    }),

  /**
   * List all versions for a chain type
   * SECURITY: Uses tenantProcedure
   */
  list: tenantProcedure
    .input(
      z.object({
        chainType: chainTypeSchema.optional(),
        status: chainVersionStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.listVersions(typedCtx.tenant.tenantId, {
        chainType: input.chainType,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get version history for a chain type
   * SECURITY: Uses tenantProcedure
   */
  getHistory: tenantProcedure
    .input(
      z.object({
        chainType: chainTypeSchema,
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.getVersionHistory(
        input.chainType,
        typedCtx.tenant.tenantId,
        input.limit
      );
    }),

  /**
   * Get audit log for a version
   * SECURITY: Uses adminProcedure (security-sensitive)
   */
  getAuditLog: adminProcedure
    .input(
      z.object({
        versionId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      return chainVersionService.getVersionAuditLog(input.versionId, input.limit);
    }),

  // ===========================================================================
  // Statistics & Monitoring
  // ===========================================================================

  /**
   * Get version statistics
   * SECURITY: Uses tenantProcedure
   */
  getStats: tenantProcedure
    .input(z.object({ chainType: chainTypeSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      const typedCtx = getTenantContext(ctx);

      return chainVersionService.getVersionStats(
        typedCtx.tenant.tenantId,
        input.chainType
      );
    }),

  /**
   * Compare two versions
   * SECURITY: Uses tenantProcedure
   */
  compare: tenantProcedure
    .input(
      z.object({
        versionIdA: z.string().uuid(),
        versionIdB: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const chainVersionService = getChainVersionService(ctx);
      return chainVersionService.compareVersions(
        input.versionIdA,
        input.versionIdB
      );
    }),
});
