'use server';

/**
 * Settings Server Actions — cache invalidation for admin / plan-level flows.
 *
 * Module access changes when an admin toggles feature flags or when a tenant
 * upgrades their plan.  Dashboard is a composite tag that wraps all widget
 * data; it must be revalidated whenever structural data changes.
 *
 * Exported helpers:
 *   revalidateModuleAccess(userId) — call after any feature-toggle mutation
 *   revalidateDashboard(userId)    — call after any widget-level data change
 *   revalidateAllDashboardCaches(userId) — composite helper that flushes
 *     DASHBOARD + MODULE_ACCESS + the per-user tag in one shot; importable
 *     by all teams.
 */

import { revalidateTag } from 'next/cache';
import { MODULE_ACCESS, DASHBOARD, userTag } from '@/lib/cache-tags';

/**
 * Invalidate the module-access cache for a specific user/tenant.
 *
 * Called when an admin toggles a feature flag or when plan-upgrade logic
 * grants/revokes module entitlements.
 */
export async function revalidateModuleAccess(userId: string): Promise<void> {
  revalidateTag(MODULE_ACCESS, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Invalidate the dashboard composite cache for a specific user.
 *
 * The DASHBOARD tag is a composite sentinel — any mutation that affects a
 * dashboard widget should also call this so the home-page widget grid is
 * kept fresh.
 */
export async function revalidateDashboard(userId: string): Promise<void> {
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Composite helper: revalidates DASHBOARD + MODULE_ACCESS + the per-user tag.
 *
 * Use this for mutations that change both plan entitlements and widget data
 * simultaneously (e.g. plan upgrade, tenant feature-toggle).  Importable by
 * all teams — they do not need to call the three individual helpers separately.
 */
export async function revalidateAllDashboardCaches(userId: string): Promise<void> {
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(MODULE_ACCESS, 'max');
  revalidateTag(userTag(userId), 'max');
}
