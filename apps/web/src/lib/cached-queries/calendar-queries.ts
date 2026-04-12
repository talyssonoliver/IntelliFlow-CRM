'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { CALENDAR_EVENTS, userTag } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the paginated appointments list used on /calendar.
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — calendar events change with
 *     create/reschedule/delete, so a short TTL is appropriate.
 *   - Tags: `calendar:events` (namespace for bulk invalidation when any
 *     appointment changes) + `user:{userId}` (per-user isolation so
 *     tenant A's events never bleed into tenant B's cache entry).
 *
 * Per-user isolation:
 *   - The `token` argument is unique per user; Next.js hashes function
 *     arguments to produce distinct cache keys automatically.
 *   - The explicit `user:{userId}` cacheTag additionally enables
 *     `revalidateTag(userTag(userId))` from Server Actions (e.g. after
 *     creating or cancelling an appointment).
 *
 * TTL rationale:
 *   Appointments are created/rescheduled/cancelled by users at any time.
 *   `minutes` (~60s) collapses the duplicate `appointments.list` calls
 *   observed on each calendar page render while staying fresh enough for
 *   normal CRM workflows.
 *
 * @param token   - JWT access token read outside this `'use cache'` boundary
 * @param userId  - Decoded JWT `sub` claim, used for the per-user cacheTag
 * @param limit   - Max appointments to return (default 20)
 * @param page    - 1-based page number (default 1)
 */
export async function fetchAppointmentsList(
  token: string | null,
  userId: string | null,
  limit = 20,
  page = 1
) {
  cacheLife(LIST_PAGE);
  cacheTag(CALENDAR_EVENTS);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.appointments.list({ limit, page, sortBy: 'startTime', sortOrder: 'asc' });
}

/**
 * Server-side fetch for appointment aggregate statistics on /calendar.
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — stats are derived from the same
 *     appointment dataset; same TTL as the list query keeps them in sync.
 *   - Tags: `calendar:events` (invalidated whenever appointments change)
 *           + `user:{userId}` (per-user isolation)
 *
 * @param token   - JWT access token read outside this `'use cache'` boundary
 * @param userId  - Decoded JWT `sub` claim, used for the per-user cacheTag
 */
export async function fetchAppointmentStats(
  token: string | null,
  userId: string | null
) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(CALENDAR_EVENTS);
  if (userId) {
    cacheTag(userTag(userId));
  }

  const caller = await createCallerFromToken(token);
  return caller.appointments.stats();
}
