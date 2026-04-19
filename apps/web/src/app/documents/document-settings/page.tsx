/**
 * Document Settings Page - PG-186
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * DocumentSettingsContent (client component) via Suspense.
 */

import { Suspense } from 'react';
import DocumentSettingsContent from './DocumentSettingsContent';
import { DocumentSettingsLoading } from './DocumentSettingsLoading';

export default function DocumentSettingsPage() {
  return (
    <Suspense fallback={<DocumentSettingsLoading />}>
      <DocumentSettingsContent />
    </Suspense>
  );
}
