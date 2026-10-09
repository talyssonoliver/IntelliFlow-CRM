import { invalidateTasksCache } from '@/app/tasks/actions';

/**
 * Flush the server-side task cache tags after a successful task mutation.
 *
 * The mutation itself has already succeeded by the time this runs, so a failed
 * revalidation must not surface as a mutation error. It is reported to the
 * console instead, and the returned promise always resolves so callers can
 * safely include it in the mutation's `onSuccess` return value.
 */
export async function revalidateTasksCache(
  userId?: string,
  includeActivityFeed = false
): Promise<void> {
  try {
    await invalidateTasksCache(userId, includeActivityFeed);
  } catch (error) {
    console.error('Failed to revalidate the tasks cache:', error);
  }
}
