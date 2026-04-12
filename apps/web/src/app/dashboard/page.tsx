/**
 * Dashboard Page — Server Component Shell
 *
 * Reads the auth token server-side (outside cache boundary),
 * prefetches lead stats via cached query, then renders the
 * full interactive dashboard as a client island.
 *
 * Task: PG-129 - Dashboard Page
 */

import { getAccessToken } from '@/lib/trpc-server';
import { fetchLeadStats } from '@/lib/cached-queries/lead-queries';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const token = await getAccessToken();

  // Prefetch lead stats — cached for 60s via 'use cache' in fetchLeadStats.
  // Errors are non-fatal: the client island will fetch on its own.
  // JSON roundtrip converts Date→string to match client-side tRPC wire format.
  let initialLeadStats: unknown = null;
  try {
    const raw = await fetchLeadStats(token);
    initialLeadStats = JSON.parse(JSON.stringify(raw)); // NOSONAR typescript:S7784 — intentional JSON roundtrip to serialize Date→string for RSC→client boundary; structuredClone preserves Date objects
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <DashboardClient initialLeadStats={initialLeadStats} />;
}
