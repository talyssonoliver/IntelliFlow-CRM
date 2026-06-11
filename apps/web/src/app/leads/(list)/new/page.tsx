import NewLeadForm from './NewLeadForm';

/**
 * New Lead route (PG-060). The form logic lives in the co-located client
 * component `NewLeadForm` so it is unit-test-measured — Next.js `page.tsx` route
 * shells are excluded from coverage by convention (logic belongs in tested
 * client components). This file is the thin route entry.
 */
export default function CreateNewLeadPage() {
  return <NewLeadForm />;
}
