'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { ACCOUNTS_LIST, ACCOUNTS_STATS, DASHBOARD } from '@/lib/cache-tags';
import { LIST_PAGE, DASHBOARD_STATS } from '@/lib/cache-profiles';

export async function fetchAccountStats(token: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(ACCOUNTS_STATS, DASHBOARD);

  const caller = await createCallerFromToken(token);
  return caller.account.stats();
}

export async function fetchAccountsFirstPage(token: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(ACCOUNTS_LIST);

  const caller = await createCallerFromToken(token);
  return caller.account.list({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}
