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
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  platformAdminProcedure,
  tenantProcedure,
} from '../../trpc';
import { toggleModuleInputSchema } from '@intelliflow/validators';
import {
  CRM_MODULES,
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
      // Admins get full access even when the module service is not yet wired
      if (ctx.user?.role === 'ADMIN') {
        return {
          modules: [...CRM_MODULES] as ModuleId[],
          plan: 'ENTERPRISE' as PlanTier,
          status: 'pending' as const,
        };
      }
      // Fail closed: non-admin users only get CORE_CRM when service is unavailable
      return {
        modules: ['CORE_CRM'] as ModuleId[],
        plan: 'STARTER' as PlanTier,
        status: 'pending' as const,
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
    // PARTNER_FREE is granted, never purchased: keep it off the upgrade/paywall listing.
    return PLAN_TIERS.filter((tier) => tier !== 'PARTNER_FREE').map((tier) => ({
      tier,
      label: tier.charAt(0) + tier.slice(1).toLowerCase(),
      modules: [...MODULE_PLAN_MAP[tier]],
      moduleDetails: MODULE_PLAN_MAP[tier].map((m) => MODULE_METADATA[m]),
    }));
  }),

  /**
   * Plan, quota limits and current usage for the caller's tenant.
   * `limit: null` means unlimited. Used by the UI to show metering.
   */
  getUsage: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;

    const quota = ctx.services?.quota;
    const moduleAccess =
      ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
    if (!quota || !moduleAccess) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Quota service not available',
      });
    }

    const [plan, limits, usage] = await Promise.all([
      moduleAccess.getTenantPlan(tenantId),
      quota.getLimits(tenantId),
      quota.getUsage(tenantId),
    ]);

    return { plan, limits, usage };
  }),

  /**
   * Toggle a module on/off for a tenant (the caller's own tenant unless `tenantId` is given).
   *
   * Platform operators only (ADR-070, PLATFORM_ADMIN_EMAILS): entitlements are what a
   * tenant pays for, so a tenant's own `ADMIN` must not be able to grant themselves modules.
   */
  toggleModule: platformAdminProcedure
    .input(toggleModuleInputSchema.extend({ tenantId: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? ctx.user?.tenantId;
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
