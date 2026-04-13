'use server';

import { revalidateTag } from 'next/cache';
import { NOTIFICATIONS_UNREAD, ACTIVITY_FEED, userTag } from '@/lib/cache-tags';

/**
 * Invalidates the Next.js cache tags for a user's notification data.
 *
 * Call this from any Server Action or mutation onSuccess handler that
 * changes read-status of notifications (markAsRead, markAllAsRead).
 *
 * Team M4 — Realtime Mutation Invalidation
 */
export async function revalidateNotifications(userId: string): Promise<void> {
  revalidateTag(NOTIFICATIONS_UNREAD, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Invalidates the Next.js cache tags for the unified activity feed.
 *
 * Export consumed by Teams M1/M2/M3 — they import this helper and call it
 * from their own server actions whenever a lead, task, ticket, or contact
 * mutation indirectly creates a new activity entry.
 *
 * Team M4 — Realtime Mutation Invalidation
 */
export async function revalidateActivityFeed(userId: string): Promise<void> {
  revalidateTag(ACTIVITY_FEED, 'max');
  revalidateTag(userTag(userId), 'max');
}
