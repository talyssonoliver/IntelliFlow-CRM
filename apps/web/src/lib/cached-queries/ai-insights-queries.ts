'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { HOME_AI_INSIGHTS, userTag } from '@/lib/cache-tags';
import { DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the AI insights panel on the authenticated home page.
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale, moderate revalidation)
 *   - Tags: `home:ai-insights` (namespace for bulk invalidation when new
 *             insights are generated or dismissed)
 *           + `user:{userId}` (per-user tag for targeted invalidation on
 *             insight dismiss / refresh events)
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user, so Next.js automatically
 *     creates a separate cache entry per user via closure/argument hashing.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` in Server Actions (e.g. when the
 *     user dismisses an insight from a Server Action context).
 *
 * TTL rationale:
 *   AI insights are generated from a background BullMQ job and typically
 *   refresh on an hourly cadence. A `minutes` (~60s) TTL keeps the panel
 *   reasonably fresh across typical page sessions without hammering the
 *   database on every request. This collapses repeated `home.getAIInsights`
 *   calls (observed at 263ms each) into a single upstream tRPC hit.
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim, used for the per-user cacheTag
 */
export async function fetchAIInsights(token: string | null, userId: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(HOME_AI_INSIGHTS);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.home.getAIInsights();
}
