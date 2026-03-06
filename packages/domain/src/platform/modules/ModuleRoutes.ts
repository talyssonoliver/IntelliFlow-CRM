/**
 * Module Routes — Maps CRM modules to navigation routes
 *
 * Defines which navigation entries belong to each module.
 * The frontend uses this to dynamically build the nav bar
 * based on tenant's enabled modules.
 *
 * Task: IFC-208 Dynamic Module Registry & Tier System
 */

import type { ModuleId } from './ModuleRegistry';

// =============================================================================
// Navigation Route Config
// =============================================================================

export interface NavRouteConfig {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  /** Optional: restrict to specific roles */
  readonly roles?: readonly string[];
}

// =============================================================================
// Module → Navigation Routes Mapping
// =============================================================================

/**
 * Each module's navigation entries.
 * Order within each module determines display order.
 * Overall order follows the module order in the nav bar.
 */
export const MODULE_NAV_ROUTES: Record<ModuleId, readonly NavRouteConfig[]> = {
  CORE_CRM: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Leads', href: '/leads', icon: 'group' },
    { label: 'Contacts', href: '/contacts', icon: 'person' },
    { label: 'Accounts', href: '/accounts', icon: 'domain' },
    { label: 'Deals', href: '/deals', icon: 'handshake' },
    { label: 'Tasks', href: '/tasks', icon: 'task_alt' },
    { label: 'Calendar', href: '/calendar', icon: 'calendar_month' },
    { label: 'Email', href: '/email', icon: 'mail' },
  ],
  LEGAL: [{ label: 'Cases', href: '/cases', icon: 'gavel' }],
  SUPPORT: [
    { label: 'Tickets', href: '/tickets', icon: 'confirmation_number' },
    { label: 'Help Center', href: '/help-center', icon: 'help_center' },
  ],
  AI_INTELLIGENCE: [{ label: 'AI & Agents', href: '/agent-approvals', icon: 'smart_toy' }],
  ANALYTICS: [{ label: 'Reports', href: '/analytics', icon: 'bar_chart' }],
  COMMERCE: [
    // No routes yet — Products pages not built
  ],
};

/**
 * Get all navigation routes for a set of enabled modules.
 * Preserves module order from CRM_MODULES constant.
 */
export function getRoutesForModules(enabledModules: readonly ModuleId[]): NavRouteConfig[] {
  return enabledModules.flatMap((m) => MODULE_NAV_ROUTES[m] ?? []);
}

/**
 * Get the module that owns a given route path.
 * Returns undefined if no module claims the route.
 */
export function getModuleForRoute(pathname: string): ModuleId | undefined {
  for (const [moduleId, routes] of Object.entries(MODULE_NAV_ROUTES)) {
    if (routes.some((r) => pathname === r.href || pathname.startsWith(r.href + '/'))) {
      return moduleId as ModuleId;
    }
  }
  return undefined;
}
