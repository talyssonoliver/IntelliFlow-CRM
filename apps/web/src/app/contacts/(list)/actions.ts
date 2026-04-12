'use server';

import { revalidateTag } from 'next/cache';
import { CONTACTS_LIST, CONTACTS_STATS, DASHBOARD } from '@/lib/cache-tags';

export async function invalidateContactsCache() {
  revalidateTag(CONTACTS_LIST, 'default');
  revalidateTag(CONTACTS_STATS, 'default');
  revalidateTag(DASHBOARD, 'default');
}
