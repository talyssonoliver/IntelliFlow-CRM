'use server';

import { revalidateTag } from 'next/cache';
import {
  ACCOUNTS_LIST,
  ACCOUNTS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

/**
 * Revalidate account caches after mutations that affect account records.
 * Call fire-and-forget from mutation onSuccess handlers.
 *
 * @example
 * const mutation = api.account.setParent.useMutation({
 *   onSuccess: () => { revalidateAccountCaches(user!.id).catch(() => {}); }
 * });
 */
export async function revalidateAccountCaches(userId: string): Promise<void> {
  revalidateTag(ACCOUNTS_LIST, 'max');
  revalidateTag(ACCOUNTS_STATS, 'max');
  revalidateTag(HOME_AI_INSIGHTS, 'max');
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}
