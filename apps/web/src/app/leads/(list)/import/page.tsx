import { CsvImporter } from '@/components/leads/csv-importer';

/**
 * Import Leads route (PG-063). The importer logic lives in the co-located client
 * component `CsvImporter` so it is unit-test-measured — Next.js `page.tsx` route
 * shells are excluded from coverage by convention. This file is the thin route
 * entry; reachability comes from the leads `(list)` layout sidebar + the Import
 * CTA on the lead list header.
 */
export default function ImportLeadsPage() {
  return <CsvImporter />;
}
