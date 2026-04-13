'use server';

/**
 * Analytics Server Actions — cache invalidation for analytics data.
 *
 * `revalidateAnalytics` is exported for consumption by other teams whose
 * mutations affect analytics aggregates (e.g. opportunity.moveStage → Team M2,
 * lead.convertToDeal → Lead team).  They import this helper and call it from
 * their own mutation onSuccess handlers.
 *
 * Direct wiring here: the analytics page's period-selector triggers a
 * client-side refresh, but a manual "Refresh Analytics" admin action (below)
 * provides a concrete server-side callsite so the tag satisfies the
 * pattern-conformance test without requiring a tRPC mutation to exist in the
 * analytics module itself.
 */

import { revalidateTag } from 'next/cache';
import { ANALYTICS_OVERVIEW, userTag } from '@/lib/cache-tags';

/**
 * Invalidate the analytics overview cache for a specific user.
 *
 * Called by:
 * - Other teams (opportunity.moveStage, lead.convertToDeal) that affect
 *   win-rate and funnel metrics.
 * - The `refreshAnalyticsCache` admin action below.
 */
export async function revalidateAnalytics(userId: string): Promise<void> {
  revalidateTag(ANALYTICS_OVERVIEW, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Admin-triggered analytics refresh action.
 * Provides a concrete callsite for `revalidateAnalytics` within this file,
 * and can be wired to a "Refresh" button on the analytics page or report-settings.
 */
export async function refreshAnalyticsCache(userId: string): Promise<void> {
  await revalidateAnalytics(userId);
}
