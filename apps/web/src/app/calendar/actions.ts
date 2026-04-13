'use server';

/**
 * Calendar Server Actions — cache invalidation for appointment mutations.
 *
 * Called from Client Components inside tRPC mutation `onSuccess` handlers
 * to invalidate the Next.js data-cache for the calendar flow.
 *
 * Covered mutations: appointments.create, appointments.reschedule,
 * appointments.cancel, appointments.update (complete / confirm / no-show
 * all also affect the calendar list — call revalidateCalendar() from their
 * onSuccess too if needed).
 */

import { revalidateTag } from 'next/cache';
import { CALENDAR_EVENTS, userTag } from '@/lib/cache-tags';

/**
 * Invalidate the calendar events cache for a specific user.
 *
 * Pass the authenticated user's ID so per-user isolated cache entries
 * are flushed alongside the shared tag.
 */
export async function revalidateCalendar(userId: string): Promise<void> {
  revalidateTag(CALENDAR_EVENTS, 'max');
  revalidateTag(userTag(userId), 'max');
}
