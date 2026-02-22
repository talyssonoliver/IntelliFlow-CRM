'use server';

import { revalidateTag } from 'next/cache';
import { ACCOUNTS_LIST, ACCOUNTS_STATS, DASHBOARD } from '@/lib/cache-tags';

export async function invalidateAccountsCache() {
  revalidateTag(ACCOUNTS_LIST, 'default');
  revalidateTag(ACCOUNTS_STATS, 'default');
  revalidateTag(DASHBOARD, 'default');
}
