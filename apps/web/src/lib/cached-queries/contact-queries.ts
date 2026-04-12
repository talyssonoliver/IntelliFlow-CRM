'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { CONTACTS_LIST, CONTACTS_STATS, DASHBOARD, userTag } from '@/lib/cache-tags';
import { DASHBOARD_STATS, LIST_PAGE } from '@/lib/cache-profiles';

export async function fetchContactStats(token: string | null, userId?: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(CONTACTS_STATS, DASHBOARD);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.contact.stats();
}

export async function fetchContactsFirstPage(token: string | null, userId?: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(CONTACTS_LIST);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.contact.list({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}
