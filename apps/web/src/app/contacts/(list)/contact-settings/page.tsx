/**
 * Contact Settings Page - PG-182
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * ContactSettingsContent (client component) via Suspense.
 */

import { Suspense } from 'react';
import ContactSettingsContent from './ContactSettingsContent';
import { ContactSettingsLoading } from './ContactSettingsLoading';

export default function ContactSettingsPage() {
  return (
    <Suspense fallback={<ContactSettingsLoading />}>
      <ContactSettingsContent />
    </Suspense>
  );
}
