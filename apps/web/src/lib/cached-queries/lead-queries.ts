'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { LEADS_LIST, LEADS_STATS, DASHBOARD, userTag } from '@/lib/cache-tags';
import { DASHBOARD_STATS, LIST_PAGE } from '@/lib/cache-profiles';

export async function fetchLeadStats(token: string | null, userId?: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(LEADS_STATS, DASHBOARD);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.lead.stats.query();
}

export async function fetchLeadsFirstPage(token: string | null, userId?: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(LEADS_LIST);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.lead.list.query({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}
