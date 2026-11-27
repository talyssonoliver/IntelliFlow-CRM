/**
 * Vertical Modules — which modules make sense for which kind of business
 *
 * Owner ruling 23/11/2026: vertical features are granted only to the business type
 * they make sense for (Cases are for law firms, Tickets for agencies). The CRM serves
 * small UK businesses (a handyman company) and our own agency, Leangency.
 *
 * Enabled modules = (plan modules ∩ vertical modules) ∪ explicit overrides.
 * This file holds the pure rule; the adapter reads plan, business type and override
 * rows and calls `resolveEnabledModules`. It is the single resolver: the API guard,
 * the module query that feeds the nav, and the backfill all use it.
 */

import { CRM_MODULES, MODULE_PLAN_MAP, type ModuleId, type PlanTier } from './ModuleRegistry';

export const TENANT_BUSINESS_TYPES = [
  'TRADES_HOME_SERVICES',
  'AGENCY',
  'LAW_FIRM',
  'SHOP_ECOMMERCE',
  'OTHER',
] as const;

export type TenantBusinessType = (typeof TENANT_BUSINESS_TYPES)[number];

export const TENANT_BUSINESS_TYPE_LABELS: Record<TenantBusinessType, string> = {
  TRADES_HOME_SERVICES: 'Trades and home services',
  AGENCY: 'Agency',
  LAW_FIRM: 'Law firm',
  SHOP_ECOMMERCE: 'Shop or e-commerce',
  OTHER: 'Something else',
};

/** Modules every business type gets (still bounded by the plan). */
const ALL_VERTICALS: readonly ModuleId[] = ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS'];

/**
 * Modules each business type can have. SUPPORT (Tickets, Help Center) is for agencies,
 * LEGAL (Cases) for law firms, COMMERCE for shops. OTHER gets the core set only.
 */
export const VERTICAL_MODULE_MAP: Record<TenantBusinessType, readonly ModuleId[]> = {
  TRADES_HOME_SERVICES: ALL_VERTICALS,
  AGENCY: [...ALL_VERTICALS, 'SUPPORT'],
  LAW_FIRM: [...ALL_VERTICALS, 'LEGAL'],
  SHOP_ECOMMERCE: [...ALL_VERTICALS, 'COMMERCE'],
  OTHER: ALL_VERTICALS,
};

/**
 * Where a TenantModule row came from.
 *  - PLAN: written by the plan sync; it only mirrors the plan and never widens access beyond the vertical.
 *  - OVERRIDE: an explicit decision (a platform operator's à-la-carte enable); it can switch a module on.
 *  - EXISTING_DATA: written by the backfill, or when the business type changes, because the workspace
 *    already holds rows in the module's tables and only the business type hides the module. It switches
 *    the module on like OVERRIDE. It is written only for a module the plan includes, so a downgrade still
 *    switches it off like any other above-plan row (see `dataProtectionFor`).
 * An `enabled: false` row of any origin switches the module off.
 */
export const TENANT_MODULE_ORIGINS = ['PLAN', 'OVERRIDE', 'EXISTING_DATA'] as const;
export type TenantModuleOrigin = (typeof TENANT_MODULE_ORIGINS)[number];

export interface ModuleOverride {
  readonly moduleId: ModuleId;
  readonly enabled: boolean;
  readonly origin?: TenantModuleOrigin;
}

export function isTenantBusinessType(value: unknown): value is TenantBusinessType {
  return typeof value === 'string' && (TENANT_BUSINESS_TYPES as readonly string[]).includes(value);
}

/** A missing business type gates like OTHER (the admin is prompted to choose). */
export function effectiveBusinessType(
  businessType: TenantBusinessType | null | undefined
): TenantBusinessType {
  return businessType ?? 'OTHER';
}

export function getModulesForBusinessType(
  businessType: TenantBusinessType | null | undefined
): readonly ModuleId[] {
  return VERTICAL_MODULE_MAP[effectiveBusinessType(businessType)];
}

export interface ResolveModulesInput {
  readonly plan: PlanTier;
  readonly businessType: TenantBusinessType | null | undefined;
  readonly overrides?: readonly ModuleOverride[];
}

/**
 * The one rule for "which modules does this workspace have".
 * Returns module ids in canonical (CRM_MODULES) order. CORE_CRM is always on.
 */
export function resolveEnabledModules(input: ResolveModulesInput): ModuleId[] {
  const vertical = new Set<ModuleId>(getModulesForBusinessType(input.businessType));
  const enabled = new Set<ModuleId>(MODULE_PLAN_MAP[input.plan].filter((m) => vertical.has(m)));

  for (const override of input.overrides ?? []) {
    if (override.moduleId === 'CORE_CRM') continue;
    if (!override.enabled) {
      enabled.delete(override.moduleId);
    } else if (override.origin === 'EXISTING_DATA') {
      // Data protection never hands out a paid module: after a downgrade the plan decides.
      if (MODULE_PLAN_MAP[input.plan].includes(override.moduleId)) enabled.add(override.moduleId);
    } else if ((override.origin ?? 'OVERRIDE') !== 'PLAN') {
      enabled.add(override.moduleId);
    }
  }

  enabled.add('CORE_CRM');
  return CRM_MODULES.filter((m) => enabled.has(m));
}

export function isModuleResolvedEnabled(moduleId: ModuleId, input: ResolveModulesInput): boolean {
  return resolveEnabledModules(input).includes(moduleId);
}

/**
 * Vertical modules whose existing rows must stay reachable when the business type would hide the module.
 * COMMERCE has no tables yet. LEGAL data is cases and documents; SUPPORT data is tickets.
 */
export const DATA_PROTECTED_MODULES = ['LEGAL', 'SUPPORT'] as const satisfies readonly ModuleId[];
export type DataProtectedModule = (typeof DATA_PROTECTED_MODULES)[number];

export type DataProtection = 'none' | 'protect' | 'review';

/**
 * What to do about a vertical module the workspace holds data in. One rule for the backfill and for a
 * business-type change, so they can never disagree:
 *  - none: no data, or the resolver already enables the module.
 *  - protect: the plan includes the module and nobody switched it off, so only the business type hides it;
 *    write an EXISTING_DATA override ON.
 *  - review: the plan does not include the module (a downgrade hid it) or someone deliberately switched it
 *    off. Writing an override would hand out a paid module or undo a decision, so a human decides.
 */
export function dataProtectionFor(input: {
  moduleId: ModuleId;
  plan: PlanTier;
  hasData: boolean;
  enabled: boolean;
  switchedOff: boolean;
}): DataProtection {
  if (!input.hasData || input.enabled) return 'none';
  if (input.switchedOff || !MODULE_PLAN_MAP[input.plan].includes(input.moduleId)) return 'review';
  return 'protect';
}

/** Message the server returns when a module is not part of the workspace. */
export const MODULE_NOT_IN_WORKSPACE_MESSAGE = "Not part of your workspace's modules";
