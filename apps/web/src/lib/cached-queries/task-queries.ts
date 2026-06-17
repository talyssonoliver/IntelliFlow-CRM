'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { TASKS_LIST, TASKS_STATS, DASHBOARD, userTag } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the task list (first page).
 *
 * Cache strategy:
 *   - Profile: `minutes` (~60s stale) — tasks change on user actions; the
 *     tRPC mutation handlers already call `utils.task.list.invalidate()` on
 *     mutations, so this cache primarily collapses concurrent SSR hits for
 *     the initial list render into a single upstream call per window.
 *   - Tags: `tasks:list` for bulk invalidation + `user:{userId}` so each
 *     user gets their own isolated cache entry (tasks are user-scoped).
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim for per-user cacheTag
 */
export async function fetchTasksFirstPage(token: string | null, userId?: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(TASKS_LIST);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.task.list.query({
    page: 1,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  } as never);
}

/**
 * Server-side fetch for task statistics (overdue count, due-today count, etc.).
 *
 * Cache strategy:
 *   - Profile: `minutes` — stats are shown in the reminder banner at the top of
 *     the task list page. A 60s window is acceptable; mutations already call
 *     `utils.task.stats.invalidate()` to keep counts fresh after user actions.
 *   - Tags: `tasks:stats` + `dashboard` for composite invalidation +
 *           `user:{userId}` for per-user isolation.
 *
 * @param token  - JWT access token read outside this `'use cache'` boundary
 * @param userId - Decoded JWT `sub` claim for per-user cacheTag
 */
export async function fetchTaskStats(token: string | null, userId?: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(TASKS_STATS, DASHBOARD);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.task.stats.query();
}
