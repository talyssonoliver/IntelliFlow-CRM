'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { ACCOUNTS_STATS, DASHBOARD } from '@/lib/cache-tags';
import { DASHBOARD_STATS } from '@/lib/cache-profiles';

export async function fetchAccountStats(token: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(ACCOUNTS_STATS, DASHBOARD);

  const caller = await createCallerFromToken(token);
  return caller.account.stats();
}
