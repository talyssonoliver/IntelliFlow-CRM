/**
 * Accounts List Page — Server Component Shell
 *
 * Reads the auth token server-side (outside cache boundary),
 * prefetches account stats via cached query, then renders the
 * full interactive list as a client island.
 */

import { getAccessToken } from '@/lib/trpc-server';
import { fetchAccountStats } from '@/lib/cached-queries/account-queries';
import { serializeForClient } from '@/lib/shared/serialize-for-client';
import AccountsPageClient from './AccountsPageClient';

export default async function AccountsPage() {
  const token = await getAccessToken();

  // Prefetch account stats — cached for 60s via 'use cache'.
  // Errors are non-fatal: the client island will fetch on its own.
  // JSON roundtrip converts Date→string to match client-side tRPC wire format.
  let initialStats: unknown = null;
  try {
    const raw = await fetchAccountStats(token);
    initialStats = serializeForClient(raw);
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <AccountsPageClient initialStats={initialStats} />;
}
