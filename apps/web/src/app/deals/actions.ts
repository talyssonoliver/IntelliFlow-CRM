'use server';

import { revalidateTag } from 'next/cache';
import { DEALS_LIST, DEALS_FORECAST, userTag } from '@/lib/cache-tags';

/**
 * Revalidate deal caches after a deal mutation.
 * Called from Client Components via `onSuccess` handler of tRPC mutations.
 * Fire-and-forget — failure must not block the mutation happy path.
 *
 * Team M2-REDO — Deal Mutation Cache Invalidation
 */
export async function revalidateDealCaches(userId: string | null): Promise<void> {
  revalidateTag(DEALS_LIST, 'max');
  revalidateTag(DEALS_FORECAST, 'max');
  if (userId) {
    revalidateTag(userTag(userId), 'max');
  }
}
