'use cache';

// @shared-cache: tenant-scoped help-center content. The `token` arg already
// keys the cache per session, and there is no per-user state to invalidate
// independently — tenant-wide invalidation is covered by HELP_ARTICLES_LIST.
// userTag(userId) isolation would only add cache fragmentation without buying
// any correctness or invalidation granularity here.

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { HELP_ARTICLES_LIST } from '@/lib/cache-tags';
import { LIST_PAGE } from '@/lib/cache-profiles';

export async function fetchHelpArticlesFirstPage(token: string | null) {
  cacheLife(LIST_PAGE);
  cacheTag(HELP_ARTICLES_LIST);

  const caller = await createCallerFromToken(token);
  return caller.helpArticle.list({
    page: 1,
    limit: 20,
    orderBy: 'order',
    orderDir: 'asc',
  });
}
