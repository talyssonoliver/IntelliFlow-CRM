/**
 * Event Types Page — PG-203 (Module Settings: Event Types, ADR-083).
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * EventTypesContent (client component) via Suspense. Matches the PG-202
 * availability and PG-205 contact-types pattern.
 */
import { Suspense } from 'react';
import EventTypesContent from './EventTypesContent';
import { EventTypesLoading } from './EventTypesLoading';

export default function EventTypesPage() {
  return (
    <Suspense fallback={<EventTypesLoading />}>
      <EventTypesContent />
    </Suspense>
  );
}
