'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { ACTIVITY_FEED, userTag } from '@/lib/cache-tags';
import { REALTIME } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the per-user unified activity feed.
 *
 * Cache strategy:
 *   - Profile: `seconds` (~30s stale, short revalidation)
 *   - Tags: `activity:feed` (global namespace for bulk invalidation)
 *           + `user:{userId}` (per-user tag for targeted invalidation when
 *             new activity arrives or user performs an action)
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user, so Next.js automatically
 *     creates a separate cache entry per user via closure/argument hashing.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` in Server Actions (e.g. when a
 *     new lead/contact/ticket is created from a Server Action context).
 *
 * TTL rationale:
 *   Activity feed changes whenever users perform CRM operations (create lead,
 *   update contact, close deal, log call, etc.). `seconds` (~30s) is short
 *   enough to reflect recent activity across page navigations while collapsing
 *   the duplicate `GET /api/trpc/activityFeed.getUnifiedFeed` calls observed
 *   at 246ms each into a single upstream tRPC hit per window.
 *
 * @param token   - JWT access token read outside this `'use cache'` boundary
 * @param userId  - Decoded JWT `sub` claim, used for the per-user cacheTag
 * @param limit   - Number of items to return (default 20, max 100)
 * @param cursor  - Opaque pagination cursor from a previous response
 */
export async function fetchUnifiedFeed(
  token: string | null,
  userId: string | null,
  limit = 20,
  cursor?: string | null
) {
  cacheLife(REALTIME);
  cacheTag(ACTIVITY_FEED);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.activityFeed.getUnifiedFeed({ limit, cursor });
}
