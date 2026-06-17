'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { TICKETS_LIST, TICKETS_STATS, DASHBOARD, userTag } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the ticket list (first page).
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — list data changes when agents work tickets
 *     but individual mutations already invalidate via tRPC utils; this collapses
 *     concurrent SSR requests into a single upstream tRPC call per window.
 *   - Tags: `tickets:list` for bulk invalidation + `user:{userId}` for per-user
 *     isolation (tenants see their own tickets; individual agents see assigned ones).
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim for per-user cacheTag
 */
export async function fetchTicketsFirstPage(token: string | null, userId?: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(TICKETS_LIST);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.ticket.list.query({
    page: 1,
    limit: 25,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  } as never);
}

/**
 * Server-side fetch for ticket dashboard stats.
 *
 * Cache strategy:
 *   - Profile: `minutes` — stats change on ticket status transitions but a 60s
 *     window is acceptable for the stat counters shown at the top of the list.
 *   - Tags: `tickets:stats` + `dashboard` (shared with other stat widgets) +
 *           `user:{userId}` for per-user tenant isolation.
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim for per-user cacheTag
 */
export async function fetchTicketStats(token: string | null, userId?: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(TICKETS_STATS, DASHBOARD);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.ticket.stats.query({} as never);
}
