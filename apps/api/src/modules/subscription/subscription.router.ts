/**
 * Subscription & Module Access Router
 *
 * Provides endpoints for querying enabled modules and managing
 * module access per tenant. Used by the frontend to dynamically
 * build navigation and gate access to add-on modules.
 *
 * Task: IFC-209 Module Access Service
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../../trpc';
import { toggleModuleInputSchema } from '@intelliflow/validators';
import {
  PLAN_TIERS,
  MODULE_PLAN_MAP,
  MODULE_METADATA,
  type ModuleId,
  type PlanTier,
} from '@intelliflow/domain';

export const moduleAccessRouter = createTRPCRouter({
  /**
   * Get all enabled modules for the current tenant.
   * Used by the frontend to build dynamic navigation.
   */
  getEnabledModules: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user?.tenantId;
    if (!tenantId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Tenant context required',
      });
    }

    const moduleAccess =
      ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
    if (!moduleAccess) {
      // Fallback: return Professional-tier modules (dev mode / no container)
      return {
        modules: [...MODULE_PLAN_MAP.PROFESSIONAL] as ModuleId[],
        plan: 'PROFESSIONAL' as PlanTier,
      };
    }

    const [modules, plan] = await Promise.all([
      moduleAccess.getEnabledModules(tenantId),
      moduleAccess.getTenantPlan(tenantId),
    ]);

    return { modules, plan };
  }),

  /**
   * Get all available plans with their included modules.
   * Used by upgrade/paywall UI.
   */
  getPlans: protectedProcedure.query(() => {
    return PLAN_TIERS.map((tier) => ({
      tier,
      label: tier.charAt(0) + tier.slice(1).toLowerCase(),
      modules: [...MODULE_PLAN_MAP[tier]],
      moduleDetails: MODULE_PLAN_MAP[tier].map((m) => MODULE_METADATA[m]),
    }));
  }),

  /**
   * Toggle a module on/off for the current tenant.
   * Only available to Enterprise plan admins.
   */
  toggleModule: adminProcedure.input(toggleModuleInputSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.user?.tenantId;
    if (!tenantId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Tenant context required',
      });
    }

    if (input.moduleId === 'CORE_CRM') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Core CRM module cannot be disabled',
      });
    }

    const moduleAccess =
      ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
    if (!moduleAccess) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Module access service not available',
      });
    }

    if (input.enabled) {
      await moduleAccess.enableModule(tenantId, input.moduleId);
    } else {
      await moduleAccess.disableModule(tenantId, input.moduleId);
    }

    // Return updated module list
    const modules = await moduleAccess.getEnabledModules(tenantId);
    const plan = await moduleAccess.getTenantPlan(tenantId);
    return { modules, plan };
  }),
});
