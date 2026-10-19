/**
 * Availability Page — PG-202 (/calendar/availability, ADR-081).
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * AvailabilityContent (client component) via Suspense. Matches the PG-204
 * case-types pattern.
 */

import { Suspense } from 'react';
import AvailabilityContent from './AvailabilityContent';
import { AvailabilityLoading } from './AvailabilityLoading';

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<AvailabilityLoading />}>
      <AvailabilityContent />
    </Suspense>
  );
}
