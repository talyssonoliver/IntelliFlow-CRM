/**
 * Module Registry — Single Source of Truth
 *
 * Canonical enum values for CRM modules and plan tiers.
 * All validator schemas derive their types from these constants.
 *
 * Task: IFC-208 Dynamic Module Registry & Tier System
 */

// =============================================================================
// CRM Modules
// =============================================================================

/**
 * All available CRM modules.
 * CORE_CRM is always enabled; others are plan-gated or à la carte add-ons.
 */
export const CRM_MODULES = [
  'CORE_CRM',
  'LEGAL',
  'SUPPORT',
  'AI_INTELLIGENCE',
  'ANALYTICS',
  'COMMERCE',
] as const;

export type ModuleId = (typeof CRM_MODULES)[number];

// =============================================================================
// Plan Tiers
// =============================================================================

/**
 * Subscription plan tiers in ascending order of capability.
 */
export const PLAN_TIERS = [
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
  'CUSTOM',
] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

// =============================================================================
// Plan → Module Mapping
// =============================================================================

/**
 * Which modules are included in each plan tier by default.
 *
 * All tiers include Core CRM, Support, Analytics, and AI (at varying capability levels).
 * Feature depth (basic vs advanced) is controlled within each module, not at the nav level.
 * Only LEGAL is a vertical add-on gated to Professional+.
 * COMMERCE is gated to Enterprise+ (no routes yet).
 *
 * Matches pricing page: even Starter gets basic AI scoring, tickets, reports.
 */
export const MODULE_PLAN_MAP: Record<PlanTier, readonly ModuleId[]> = {
  STARTER: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS'],
  PROFESSIONAL: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL'],
  ENTERPRISE: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL', 'COMMERCE'],
  CUSTOM: ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'LEGAL', 'COMMERCE'],
};

// =============================================================================
// Module Metadata
// =============================================================================

export interface ModuleMetadata {
  readonly id: ModuleId;
  readonly label: string;
  readonly description: string;
  /** Whether this module is always enabled regardless of plan */
  readonly isCore: boolean;
}

export const MODULE_METADATA: Record<ModuleId, ModuleMetadata> = {
  CORE_CRM: {
    id: 'CORE_CRM',
    label: 'CRM',
    description: 'Core CRM — Dashboard, Leads, Contacts, Accounts, Deals, Tasks',
    isCore: true,
  },
  LEGAL: {
    id: 'LEGAL',
    label: 'Legal',
    description: 'Legal case management, deadlines, appointments, and document handling',
    isCore: false,
  },
  SUPPORT: {
    id: 'SUPPORT',
    label: 'Support',
    description: 'Ticket management with SLA tracking',
    isCore: false,
  },
  AI_INTELLIGENCE: {
    id: 'AI_INTELLIGENCE',
    label: 'AI & Agents',
    description: 'AI scoring, agent approvals, monitoring, and conversation intelligence',
    isCore: false,
  },
  ANALYTICS: {
    id: 'ANALYTICS',
    label: 'Analytics',
    description: 'Reports, dashboards, and data analytics',
    isCore: false,
  },
  COMMERCE: {
    id: 'COMMERCE',
    label: 'Commerce',
    description: 'Product catalog and commerce workflows',
    isCore: false,
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the modules included in a given plan tier.
 */
export function getModulesForPlan(plan: PlanTier): readonly ModuleId[] {
  return MODULE_PLAN_MAP[plan];
}

/**
 * Check if a module is included in a plan tier.
 */
export function isModuleInPlan(module: ModuleId, plan: PlanTier): boolean {
  return MODULE_PLAN_MAP[plan].includes(module);
}

/**
 * Get the minimum plan tier required for a module.
 * Returns undefined for CORE_CRM (always available).
 */
export function getMinimumPlanForModule(module: ModuleId): PlanTier | undefined {
  if (module === 'CORE_CRM') return undefined;
  for (const tier of PLAN_TIERS) {
    if (MODULE_PLAN_MAP[tier].includes(module)) {
      return tier;
    }
  }
  return 'ENTERPRISE';
}
