'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { ANALYTICS_OVERVIEW, userTag } from '@/lib/cache-tags';
import { DASHBOARD_STATS, RECORD_DETAIL } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the analytics overview panel on /analytics.
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — the overview aggregates revenue,
 *     lead, opportunity, and win-rate metrics. These are expensive parallel
 *     queries that change slowly relative to individual record mutations.
 *   - Tags: `analytics:overview` (bulk invalidation on report refresh)
 *           + `user:{userId}` (per-tenant isolation)
 *
 * Per-user isolation:
 *   - Each tenant's analytics data is scoped by `tenantId` inside the tRPC
 *     procedure. The `token` argument is unique per user so Next.js produces
 *     separate cache entries automatically.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` from Server Actions when a deal is
 *     closed or a new lead is created.
 *
 * TTL rationale:
 *   `getOverview` fans out to multiple DB aggregations (revenue, leads,
 *   opportunities, win rate, recent activity). A `minutes` TTL collapses
 *   the repeated calls observed on each analytics page load while staying
 *   fresh enough for dashboard workflows.
 *
 * @param token     - JWT access token read outside this `'use cache'` boundary
 * @param userId    - Decoded JWT `sub` claim, used for the per-user cacheTag
 * @param startDate - ISO datetime string for period start (optional)
 * @param endDate   - ISO datetime string for period end (optional)
 */
export async function fetchAnalyticsOverview(
  token: string | null,
  userId: string | null,
  startDate?: string,
  endDate?: string
) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(ANALYTICS_OVERVIEW);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.analytics.getOverview({ startDate, endDate });
}

/**
 * Server-side fetch for the conversion funnel used on /analytics.
 *
 * Cache strategy:
 *   - Profile: `hours` (~1 h stale) — the 7-stage pipeline funnel aggregates
 *     historical opportunity data. It is expensive to compute and changes
 *     infrequently relative to real-time activity.
 *   - Tags: `analytics:overview` (shares invalidation namespace with the
 *     overview so a single `revalidateTag('analytics:overview')` refreshes
 *     both) + `user:{userId}` (per-tenant isolation)
 *
 * TTL rationale:
 *   Funnel data spans the selected date range and only changes when deals
 *   move stages. `hours` keeps the cache warm across repeated navigations
 *   while reducing upstream DB load from the most expensive analytics query.
 *
 * @param token        - JWT access token read outside this `'use cache'` boundary
 * @param userId       - Decoded JWT `sub` claim, used for the per-user cacheTag
 * @param startDate    - ISO datetime string for period start
 * @param endDate      - ISO datetime string for period end
 * @param includeLeads - Whether to include lead-stage entries (default true)
 */
export async function fetchConversionFunnel(
  token: string | null,
  userId: string | null,
  startDate: string,
  endDate: string,
  includeLeads = true
) {
  cacheLife(RECORD_DETAIL);
  cacheTag(ANALYTICS_OVERVIEW);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.analytics.getConversionFunnel({ startDate, endDate, includeLeads });
}
