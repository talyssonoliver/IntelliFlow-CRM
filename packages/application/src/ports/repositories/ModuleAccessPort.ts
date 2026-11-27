/**
 * Module Access Port
 *
 * Interface for checking which CRM modules are enabled for a tenant.
 * Implementations should check TenantModule records and fall back
 * to plan tier defaults via MODULE_PLAN_MAP.
 *
 * Task: IFC-209 Module Access Service
 */

import type {
  ModuleId,
  PlanTier,
  TenantBusinessType,
  TenantModuleOrigin,
} from '@intelliflow/domain';

export interface TenantModuleRecord {
  tenantId: string;
  moduleId: ModuleId;
  enabled: boolean;
  enabledAt: Date;
  disabledAt: Date | null;
  origin?: TenantModuleOrigin;
}

export interface ModuleAccessPort {
  /**
   * Get all enabled modules for a tenant.
   * Single resolver: (plan modules ∩ business-type modules) ∪ explicit OVERRIDE rows,
   * minus rows switched off (see `resolveEnabledModules` in the domain).
   */
  getEnabledModules(tenantId: string): Promise<ModuleId[]>;

  /**
   * Check if a specific module is enabled for a tenant.
   */
  isModuleEnabled(tenantId: string, moduleId: ModuleId): Promise<boolean>;

  /**
   * The tenant's business type, or null when it has not been chosen yet
   * (gated like OTHER; the admin is prompted to choose).
   */
  getBusinessType(tenantId: string): Promise<TenantBusinessType | null>;

  /**
   * Set the tenant's business type (admin action; the API checks the role).
   * Modules the workspace already holds data in (cases, documents, tickets) stay on via an
   * EXISTING_DATA override. Returns the modules that were protected that way.
   */
  setBusinessType(tenantId: string, businessType: TenantBusinessType): Promise<ModuleId[]>;

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
