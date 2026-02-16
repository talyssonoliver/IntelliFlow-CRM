/**
 * Module & Plan Tier Validation Schemas
 *
 * Derived from domain constants (single source of truth pattern).
 *
 * Task: IFC-208 Dynamic Module Registry & Tier System
 */

import { z } from 'zod';
import { CRM_MODULES, PLAN_TIERS } from '@intelliflow/domain';

// =============================================================================
// Enum Schemas (derived from domain constants)
// =============================================================================

export const moduleIdSchema = z.enum(CRM_MODULES);
export const planTierSchema = z.enum(PLAN_TIERS);

export type ModuleIdInput = z.infer<typeof moduleIdSchema>;
export type PlanTierInput = z.infer<typeof planTierSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const getEnabledModulesInputSchema = z.object({
  tenantId: z.string().optional(), // Falls back to ctx.user.tenantId
});

export const toggleModuleInputSchema = z.object({
  moduleId: moduleIdSchema,
  enabled: z.boolean(),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const enabledModulesResponseSchema = z.object({
  modules: z.array(moduleIdSchema),
  plan: planTierSchema,
});

export const planInfoSchema = z.object({
  tier: planTierSchema,
  label: z.string(),
  modules: z.array(moduleIdSchema),
});

export const plansResponseSchema = z.array(planInfoSchema);
