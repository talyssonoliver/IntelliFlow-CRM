import { invalidateTicketsCache } from '@/app/tickets/actions';

/**
 * Flush the server-side ticket cache tags after a successful ticket mutation.
 *
 * The mutation itself has already succeeded by the time this runs, so a failed
 * revalidation must not surface as a mutation error. It is reported to the
 * console instead, and the returned promise always resolves so callers can
 * safely include it in the mutation's `onSuccess` return value.
 */
export async function revalidateTicketsCache(): Promise<void> {
  try {
    await invalidateTicketsCache();
  } catch (error) {
    console.error('Failed to revalidate the tickets cache:', error);
  }
}
