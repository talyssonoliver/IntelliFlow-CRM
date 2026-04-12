'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { createCallerFromToken } from '@/lib/trpc-server';
import { DASHBOARD, userTag } from '@/lib/cache-tags';
import { DASHBOARD_STATS } from '@/lib/cache-profiles';

/**
 * Server-side fetch for the welcome summary displayed on the authenticated home page.
 * Includes userName and greeting so the initial server-rendered HTML already shows
 * the user's name — no client-side hydration flash.
 *
 * 60-second cache matches the client-side React Query staleTime for the same endpoint.
 */
export async function fetchWelcomeSummary(token: string | null, userId?: string | null) {
  cacheLife(DASHBOARD_STATS);
  cacheTag(DASHBOARD);
  if (userId) cacheTag(userTag(userId));

  const caller = await createCallerFromToken(token);
  return caller.home.getWelcomeSummary();
}
