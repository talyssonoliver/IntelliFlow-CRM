/**
 * Leads List Page — Server Component Shell
 *
 * Reads the auth token server-side (outside cache boundary),
 * prefetches the first page of leads via cached query, then
 * renders the full interactive list as a client island.
 *
 * Task: IFC-014 - Lead List
 */

import { getAccessToken } from '@/lib/trpc-server';
import { fetchLeadsFirstPage } from '@/lib/cached-queries/lead-queries';
import LeadsPageClient from './LeadsPageClient';

export default async function LeadsPage() {
  const token = await getAccessToken();

  // Prefetch first page of leads — cached for 60s via 'use cache'.
  // Errors are non-fatal: the client island will fetch on its own.
  // JSON roundtrip converts Date→string to match client-side tRPC wire format.
  let initialData: unknown = null;
  try {
    const raw = await fetchLeadsFirstPage(token);
    initialData = JSON.parse(JSON.stringify(raw));
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <LeadsPageClient initialData={initialData} />;
}
