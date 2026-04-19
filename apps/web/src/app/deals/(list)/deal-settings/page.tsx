/**
 * Deal Settings Page - PG-184
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * DealSettingsContent (client component) via Suspense. Mirrors the PG-182
 * contact-settings / PG-183 account-settings pattern.
 */

import { Suspense } from 'react';
import DealSettingsContent from './DealSettingsContent';
import { DealSettingsLoading } from './DealSettingsLoading';

export default function DealSettingsPage() {
  return (
    <Suspense fallback={<DealSettingsLoading />}>
      <DealSettingsContent />
    </Suspense>
  );
}
