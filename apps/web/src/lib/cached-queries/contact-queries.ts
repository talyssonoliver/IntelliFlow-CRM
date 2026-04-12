'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { CONTACTS_LIST, userTag } from '@/lib/cache-tags';
import { LIST_PAGE } from '@/lib/cache-profiles';

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
