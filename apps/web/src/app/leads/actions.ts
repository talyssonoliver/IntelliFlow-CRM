'use server';

import { revalidateTag } from 'next/cache';
import {
  LEADS_LIST,
  LEADS_STATS,
  CONTACTS_LIST,
  CONTACTS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

/**
 * Revalidate lead caches after a mutation that affects only lead records.
 * Call fire-and-forget from mutation onSuccess handlers.
 *
 * @example
 * const mutation = api.lead.qualify.useMutation({
 *   onSuccess: () => { revalidateLeadCaches(user!.id).catch(() => {}); }
 * });
 */
export async function revalidateLeadCaches(userId: string): Promise<void> {
  revalidateTag(LEADS_LIST, 'max');
  revalidateTag(LEADS_STATS, 'max');
  revalidateTag(HOME_AI_INSIGHTS, 'max');
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}

/**
 * Revalidate caches after a lead→contact conversion.
 * Both leads and contacts caches go stale simultaneously.
 *
 * @example
 * const mutation = api.lead.convert.useMutation({
 *   onSuccess: () => { revalidateLeadConversionCaches(user!.id).catch(() => {}); }
 * });
 */
export async function revalidateLeadConversionCaches(userId: string): Promise<void> {
  revalidateTag(LEADS_LIST, 'max');
  revalidateTag(LEADS_STATS, 'max');
  revalidateTag(CONTACTS_LIST, 'max');
  revalidateTag(CONTACTS_STATS, 'max');
  revalidateTag(HOME_AI_INSIGHTS, 'max');
  revalidateTag(DASHBOARD, 'max');
  revalidateTag(userTag(userId), 'max');
}
