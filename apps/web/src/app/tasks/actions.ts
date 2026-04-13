'use server';

import { revalidateTag } from 'next/cache';
import { TASKS_LIST, TASKS_STATS, DASHBOARD, ACTIVITY_FEED, userTag } from '@/lib/cache-tags';

/**
 * Invalidates all task-related cache tags.
 *
 * Call from tRPC mutation onSuccess handlers in Client Components.
 * Covers: task.create, task.update, task.complete, task.delete,
 * task.archive, task.start, task.cancel, task.assign, task.reschedule,
 * task.bulkAssign.
 *
 * @param userId - Optional user ID for per-user cache flush.
 * @param includeActivityFeed - Set true for task.complete and task.create
 *   which write a task_completed / task_created event to the activity feed.
 */
export async function invalidateTasksCache(
  userId?: string,
  includeActivityFeed = false
): Promise<void> {
  revalidateTag(TASKS_LIST, 'max');
  revalidateTag(TASKS_STATS, 'max');
  revalidateTag(DASHBOARD, 'max');
  if (includeActivityFeed) {
    revalidateTag(ACTIVITY_FEED, 'max');
  }
  if (userId) {
    revalidateTag(userTag(userId), 'max');
  }
}
