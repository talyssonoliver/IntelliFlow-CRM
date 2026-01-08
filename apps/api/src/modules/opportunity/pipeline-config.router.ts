/**
 * Pipeline Configuration Router
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Provides type-safe tRPC endpoints for pipeline stage configuration:
 * - Get current pipeline configuration (with defaults if not customized)
 * - Update individual stage configuration
 * - Batch update all stages
 * - Reset to defaults
 *
 * Target: <100ms save operations
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  opportunityStageSchema,
  updatePipelineStageConfigSchema,
  updatePipelineConfigSchema,
  DEFAULT_STAGE_COLORS,
  DEFAULT_STAGE_PROBABILITIES,
  DEFAULT_STAGE_NAMES,
} from '@intelliflow/validators/opportunity';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import {
  getTenantContext,
  type TenantAwareContext,
} from '../../security/tenant-context';

/**
 * Get default configuration for a stage
 */
function getDefaultStageConfig(stageKey: string, order: number) {
  return {
    stageKey,
    displayName: DEFAULT_STAGE_NAMES[stageKey] || stageKey,
    color: DEFAULT_STAGE_COLORS[stageKey] || '#6366f1',
    order,
    probability: DEFAULT_STAGE_PROBABILITIES[stageKey] || 0,
    isActive: true,
  };
}

export const pipelineConfigRouter = createTRPCRouter({
  /**
   * Get all pipeline stage configurations for the current tenant
   * Returns default values for stages that haven't been customized
   */
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const { tenantId } = typedCtx.tenant;

    // Get all existing configs for this tenant
    const existingConfigs = await typedCtx.prismaWithTenant.pipelineStageConfig.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });

    // Create a map for quick lookup
    const configMap = new Map(
      existingConfigs.map((config) => [config.stageKey, config])
    );

    // Build complete config array with defaults for missing stages
    const stages = OPPORTUNITY_STAGES.map((stageKey, index) => {
      const existing = configMap.get(stageKey);
      if (existing) {
        return {
          id: existing.id,
          stageKey: existing.stageKey,
          displayName: existing.displayName,
          color: existing.color,
          order: existing.order,
          probability: existing.probability,
          isActive: existing.isActive,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        };
      }
      // Return default config with placeholder id
      return {
        id: `default-${stageKey}`,
        ...getDefaultStageConfig(stageKey, index),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Sort by order
    stages.sort((a, b) => a.order - b.order);

    return { stages };
  }),

  /**
   * Update a single pipeline stage configuration
   */
  updateStage: tenantProcedure
    .input(updatePipelineStageConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { tenantId } = typedCtx.tenant;
      const { stageKey, ...updateData } = input;

      // Check if config exists for this stage
      const existingConfig = await typedCtx.prismaWithTenant.pipelineStageConfig.findUnique({
        where: {
          tenantId_stageKey: {
            tenantId,
            stageKey,
          },
        },
      });

      if (existingConfig) {
        // Update existing config
        const updated = await typedCtx.prismaWithTenant.pipelineStageConfig.update({
          where: {
            tenantId_stageKey: {
              tenantId,
              stageKey,
            },
          },
          data: updateData,
        });
        return updated;
      }

      // Create new config with defaults merged with input
      const stageIndex = OPPORTUNITY_STAGES.indexOf(stageKey);
      const defaults = getDefaultStageConfig(stageKey, stageIndex);
      const created = await typedCtx.prismaWithTenant.pipelineStageConfig.create({
        data: {
          tenantId,
          stageKey,
          displayName: updateData.displayName ?? defaults.displayName,
          color: updateData.color ?? defaults.color,
          order: updateData.order ?? defaults.order,
          probability: updateData.probability ?? defaults.probability,
          isActive: updateData.isActive ?? defaults.isActive,
        },
      });
      return created;
    }),

  /**
   * Batch update all pipeline stages
   * Used for drag-and-drop reordering and bulk edits
   */
  updateAll: tenantProcedure
    .input(updatePipelineConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { tenantId } = typedCtx.tenant;

      // Use transaction to ensure atomicity
      const results = await typedCtx.prismaWithTenant.$transaction(
        input.stages.map((stage) =>
          typedCtx.prismaWithTenant.pipelineStageConfig.upsert({
            where: {
              tenantId_stageKey: {
                tenantId,
                stageKey: stage.stageKey,
              },
            },
            create: {
              tenantId,
              stageKey: stage.stageKey,
              displayName: stage.displayName,
              color: stage.color,
              order: stage.order,
              probability: stage.probability,
              isActive: stage.isActive,
            },
            update: {
              displayName: stage.displayName,
              color: stage.color,
              order: stage.order,
              probability: stage.probability,
              isActive: stage.isActive,
            },
          })
        )
      );

      return { success: true, updatedCount: results.length };
    }),

  /**
   * Reset all pipeline stages to defaults
   * Deletes all custom configurations for the tenant
   */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const { tenantId } = typedCtx.tenant;

    // Delete all custom configs for this tenant
    const { count } = await typedCtx.prismaWithTenant.pipelineStageConfig.deleteMany({
      where: { tenantId },
    });

    return { success: true, deletedCount: count };
  }),

  /**
   * Get pipeline stage statistics
   * Returns count of deals per stage for the current tenant
   */
  getStats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);

    // Get deal counts per stage
    const stageStats = await typedCtx.prismaWithTenant.opportunity.groupBy({
      by: ['stage'],
      _count: true,
      _sum: { value: true },
    });

    // Get pipeline configs
    const configs = await typedCtx.prismaWithTenant.pipelineStageConfig.findMany({
      where: { tenantId: typedCtx.tenant.tenantId },
      orderBy: { order: 'asc' },
    });

    // Build complete stats with defaults
    const stats = OPPORTUNITY_STAGES.map((stageKey, index) => {
      const config = configs.find((c) => c.stageKey === stageKey);
      const stageStat = stageStats.find((s) => s.stage === stageKey);

      return {
        stageKey,
        displayName: config?.displayName ?? DEFAULT_STAGE_NAMES[stageKey],
        color: config?.color ?? DEFAULT_STAGE_COLORS[stageKey],
        order: config?.order ?? index,
        dealCount: stageStat?._count ?? 0,
        totalValue: stageStat?._sum.value?.toString() ?? '0',
        isActive: config?.isActive ?? true,
      };
    });

    // Sort by order
    stats.sort((a, b) => a.order - b.order);

    return { stats };
  }),
});
