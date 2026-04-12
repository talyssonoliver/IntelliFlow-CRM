'use server';

import { revalidateTag } from 'next/cache';
import { LEADS_LIST, LEADS_STATS, DASHBOARD } from '@/lib/cache-tags';

export async function invalidateLeadsCache() {
  revalidateTag(LEADS_LIST, 'default');
  revalidateTag(LEADS_STATS, 'default');
  revalidateTag(DASHBOARD, 'default');
}
