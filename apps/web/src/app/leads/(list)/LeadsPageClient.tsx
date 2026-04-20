'use client';

import LeadList from '@/components/leads/lead-list';

/**
 * Lead List page client-island wrapper (PG-059 refactor).
 *
 * Delegates all behaviour to <LeadList>, which lives in
 * `apps/web/src/components/leads/lead-list.tsx` and can be composed from
 * sibling list surfaces (pipeline, routing) without copying the island.
 */
export default function LeadsPageClient({ initialData }: { initialData?: unknown } = {}) {
  return <LeadList initialData={initialData} />;
}
