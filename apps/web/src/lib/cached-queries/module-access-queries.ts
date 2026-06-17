'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { MODULE_ACCESS, userTag } from '@/lib/cache-tags';
import { RECORD_DETAIL } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the per-user enabled module list.
 *
 * Cache strategy:
 *   - Profile: `hours` (~1h stale, long revalidation)
 *   - Tags: `module:access` (global namespace for bulk invalidation on
 *             plan upgrades / admin toggles)
 *           + `user:{userId}` (per-user tag for targeted invalidation when
 *             the tenant's plan changes or an admin toggles a module)
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user, so Next.js automatically
 *     creates a separate cache entry per user via closure/argument hashing.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` in Server Actions (e.g. after a
 *     successful plan upgrade or `moduleAccess.toggleModule` mutation).
 *
 * TTL rationale:
 *   Enabled modules change only on plan upgrades or admin module toggles —
 *   rare events. `hours` (via the RECORD_DETAIL profile, ~1h) eliminates
 *   the repeated `GET /api/trpc/moduleAccess.getEnabledModules` calls on
 *   every page render while keeping the cache coherent with the client-side
 *   `staleTime: 5 * 60 * 1000` (5 min) already set in `useEnabledModules`.
 *   On plan change, call `revalidateTag(MODULE_ACCESS)` or
 *   `revalidateTag(userTag(userId))` to immediately bust the cache.
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim, used for the per-user cacheTag
 */
export async function fetchEnabledModules(token: string | null, userId: string | null) {
  cacheLife(RECORD_DETAIL);
  cacheTag(MODULE_ACCESS);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.moduleAccess.getEnabledModules.query();
}
