/**
 * Ticket Settings Page - PG-185
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * TicketSettingsContent (client component) via Suspense. Matches the
 * PG-182/PG-183/PG-184 module-settings pattern.
 *
 * The route lives under `(list)/` so the existing `TicketSettingsSidebarNav`
 * (wired in `apps/web/src/app/tickets/(list)/layout.tsx`) applies.
 */

import { Suspense } from 'react';
import TicketSettingsContent from './TicketSettingsContent';
import { TicketSettingsLoading } from './TicketSettingsLoading';

export default function TicketSettingsPage() {
  return (
    <Suspense fallback={<TicketSettingsLoading />}>
      <TicketSettingsContent />
    </Suspense>
  );
}
