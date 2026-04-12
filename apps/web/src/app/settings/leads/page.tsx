/**
 * Lead Settings Page - PG-178
 *
 * Server Component shell — streams the skeleton immediately, then
 * hydrates LeadSettingsContent (client component) via Suspense.
 */

import { Suspense } from 'react';
import LeadSettingsContent from './LeadSettingsContent';
import { LeadSettingsLoading } from './LeadSettingsLoading';

export default function LeadSettingsPage() {
  return (
    <Suspense fallback={<LeadSettingsLoading />}>
      <LeadSettingsContent />
    </Suspense>
  );
}
