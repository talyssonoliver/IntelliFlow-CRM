'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { DEALS_LIST, DEALS_FORECAST, userTag } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the deals list (opportunity.list procedure).
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale, 1-minute revalidation)
 *   - Tags: `deals:list` (global namespace for bulk invalidation)
 *           + `user:{userId}` (per-user tag for targeted invalidation when
 *             a deal is created, updated, or stage-changed from a Server Action)
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user, so Next.js automatically
 *     creates a separate cache entry per user via closure/argument hashing.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` in Server Actions.
 *
 * @param token   - JWT access token read outside this `'use cache'` boundary
 * @param userId  - Decoded JWT `sub` claim, used for the per-user cacheTag
 * @param limit   - Number of records per page (default 100 for pipeline view)
 * @param page    - 1-based page number (default 1)
 */
export async function fetchDeals(
  token: string | null,
  userId: string | null,
  limit = 100,
  page = 1
) {
  cacheLife(LIST_PAGE);
  cacheTag(DEALS_LIST);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.opportunity.list({
    limit,
    page,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}

/**
 * Server-side fetch for the deal forecast (opportunity.forecast procedure).
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — forecast aggregates change at most
 *     once per pipeline mutation, so 60s provides a good balance between
 *     freshness and upstream query reduction.
 *   - Tags: `deals:forecast` (bulk invalidation when any deal closes/moves)
 *           + `user:{userId}` (per-user tag so `revalidateTag(userTag(userId))`
 *             flushes both list and forecast in one call)
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim, used for the per-user cacheTag
 */
export async function fetchDealForecast(token: string | null, userId: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(DEALS_FORECAST);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.opportunity.forecast();
}
