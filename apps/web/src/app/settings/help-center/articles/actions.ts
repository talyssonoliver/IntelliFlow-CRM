'use server';

import { revalidateTag } from 'next/cache';
import { HELP_ARTICLES_LIST, userTag } from '@/lib/cache-tags';

/**
 * Revalidate help article caches after admin mutations (publish/unpublish/
 * delete/create/update). Call fire-and-forget from mutation onSuccess
 * handlers in article-admin-list.tsx.
 */
export async function revalidateHelpArticleCaches(userId?: string): Promise<void> {
  revalidateTag(HELP_ARTICLES_LIST, 'max');
  if (userId) revalidateTag(userTag(userId), 'max');
}
