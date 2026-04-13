'use server';

import { revalidateTag } from 'next/cache';
import {
  CONTACTS_LIST,
  CONTACTS_STATS,
  ACCOUNTS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

/**
 * Revalidate contact caches after mutations that affect contact records.
 * Call fire-and-forget from mutation onSuccess handlers.
 *
 * @example
 * const mutation = api.contact.bulkDelete.useMutation({
 *   onSuccess: () => { revalidateContactCaches(user!.id).catch(() => {}); }
 * });
 */
export async function revalidateContactCaches(userId: string): Promise<void> {
  revalidateTag(CONTACTS_LIST, 'max');
  revalidateTag(CONTACTS_STATS, 'max');
  revalidateTag(HOME_AI_INSIGHTS, 'max');
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Revalidate caches after a contact↔account link/unlink mutation.
 * The withAccounts counter in contacts stats and accounts stats both become stale.
 *
 * @example
 * const mutation = api.contact.linkToAccount.useMutation({
 *   onSuccess: () => { revalidateContactAccountLinkCaches(user!.id).catch(() => {}); }
 * });
 */
export async function revalidateContactAccountLinkCaches(userId: string): Promise<void> {
  revalidateTag(CONTACTS_LIST, 'max');
  revalidateTag(CONTACTS_STATS, 'max');
  revalidateTag(ACCOUNTS_STATS, 'max');
  revalidateTag(HOME_AI_INSIGHTS, 'max');
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}
