/**
 * Case Types Page — PG-204 (served at /cases/case-types by the (list) route group).
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * CaseTypesContent (client component) via Suspense. Matches the PG-197
 * territory-mapping pattern.
 */

import { Suspense } from 'react';
import CaseTypesContent from './CaseTypesContent';
import { CaseTypesLoading } from './CaseTypesLoading';

export default function CaseTypesPage() {
  return (
    <Suspense fallback={<CaseTypesLoading />}>
      <CaseTypesContent />
    </Suspense>
  );
}
