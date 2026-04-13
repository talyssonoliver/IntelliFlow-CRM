'use server';

import { revalidateTag } from 'next/cache';
import { TICKETS_LIST, TICKETS_STATS, DASHBOARD, ACTIVITY_FEED, userTag } from '@/lib/cache-tags';

/**
 * Invalidates all ticket-related cache tags.
 *
 * Call from tRPC mutation onSuccess handlers in Client Components.
 * Covers: ticket.create, ticket.update, ticket.assign, ticket.close,
 * ticket.changeStatus, ticket.delete, ticket.archive, ticket.bulkAssign,
 * ticket.bulkUpdateStatus, ticket.bulkResolve, ticket.bulkEscalate,
 * ticket.bulkClose.
 *
 * @param userId - Optional user ID for per-user cache flush.
 * @param includeActivityFeed - Set true for mutations that write to
 *   ContactActivity (e.g. ticket.create with contactEmail side-effect).
 */
export async function invalidateTicketsCache(
  userId?: string,
  includeActivityFeed = false
): Promise<void> {
  revalidateTag(TICKETS_LIST, 'max');
  revalidateTag(TICKETS_STATS, 'max');
  revalidateTag(DASHBOARD, 'max');
  if (includeActivityFeed) {
    revalidateTag(ACTIVITY_FEED, 'max');
  }
  if (userId) {
    revalidateTag(userTag(userId), 'max');
  }
}
