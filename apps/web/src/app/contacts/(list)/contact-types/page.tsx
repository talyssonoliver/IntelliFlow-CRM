/**
 * Contact Types Page — PG-205 (served at /contacts/contact-types by the (list) route group).
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * ContactTypesContent (client component) via Suspense. Matches the PG-204
 * case-types pattern.
 */

import { Suspense } from 'react';
import ContactTypesContent from './ContactTypesContent';
import { ContactTypesLoading } from './ContactTypesLoading';

export default function ContactTypesPage() {
  return (
    <Suspense fallback={<ContactTypesLoading />}>
      <ContactTypesContent />
    </Suspense>
  );
}
