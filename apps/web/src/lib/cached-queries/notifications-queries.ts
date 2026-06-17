'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { NOTIFICATIONS_UNREAD, userTag } from '@/lib/cache-tags';
import { REALTIME } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the per-user unread notification count.
 *
 * Cache strategy:
 *   - Profile: `seconds` (~30s stale, short revalidation)
 *   - Tags: `notifications:unread` (global namespace for bulk invalidation)
 *           + `user:{userId}` (per-user tag for targeted invalidation on
 *             mark-as-read / new notification events)
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user, so Next.js automatically
 *     creates a separate cache entry per user via closure/argument hashing.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` in Server Actions (e.g. when a
 *     notification is marked as read from a Server Action context).
 *
 * TTL rationale:
 *   The unread count changes on every notification event and every
 *   mark-as-read action. `seconds` (~30s) is short enough to avoid
 *   showing stale counts across page interactions, while being long
 *   enough to collapse the 3× duplicate `GET /api/trpc/notifications.getUnreadCount`
 *   calls observed per page (294ms each) into a single upstream tRPC hit.
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim, used for the per-user cacheTag
 */
export async function fetchUnreadCount(token: string | null, userId: string | null) {
  cacheLife(REALTIME);
  cacheTag(NOTIFICATIONS_UNREAD);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.notifications.getUnreadCount.query();
}
