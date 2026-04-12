/**
 * Module Access Port
 *
 * Interface for checking which CRM modules are enabled for a tenant.
 * Implementations should check TenantModule records and fall back
 * to plan tier defaults via MODULE_PLAN_MAP.
 *
 * Task: IFC-209 Module Access Service
 */

import type { ModuleId, PlanTier } from '@intelliflow/domain';

export interface TenantModuleRecord {
  tenantId: string;
  moduleId: ModuleId;
  enabled: boolean;
  enabledAt: Date;
  disabledAt: Date | null;
}

export interface ModuleAccessPort {
  /**
   * Get all enabled modules for a tenant.
   * Merges plan-tier defaults with per-tenant overrides (TenantModule records).
   */
  getEnabledModules(tenantId: string): Promise<ModuleId[]>;

  /**
   * Check if a specific module is enabled for a tenant.
   */
  isModuleEnabled(tenantId: string, moduleId: ModuleId): Promise<boolean>;

  /**
   * Get the tenant's current plan tier.
   * Returns FREE if no workspace/plan is found.
   */
  getTenantPlan(tenantId: string): Promise<PlanTier>;

  /**
   * Enable a module for a tenant (à la carte).
   */
  enableModule(tenantId: string, moduleId: ModuleId): Promise<TenantModuleRecord>;

  /**
   * Disable a module for a tenant.
   */
  disableModule(tenantId: string, moduleId: ModuleId): Promise<TenantModuleRecord>;

  /**
   * Sync a tenant's modules to match their plan tier.
   * Enables all plan-included modules, keeps à la carte additions.
   */
  syncModulesToPlan(tenantId: string, plan: PlanTier): Promise<ModuleId[]>;
}
