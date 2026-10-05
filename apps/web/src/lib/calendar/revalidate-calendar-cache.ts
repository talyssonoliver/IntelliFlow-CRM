import { revalidateCalendar } from '@/app/calendar/actions';

/**
 * Flush the server-side calendar cache tags after a successful appointment
 * mutation.
 *
 * The mutation itself has already succeeded by the time this runs, so a failed
 * revalidation must not surface as a mutation error. It is reported to the
 * console instead, and the returned promise always resolves so callers can
 * safely include it in the mutation's `onSuccess` return value.
 */
export async function revalidateCalendarCache(userId: string): Promise<void> {
  try {
    await revalidateCalendar(userId);
  } catch (error) {
    console.error('Failed to revalidate the calendar cache:', error);
  }
}
