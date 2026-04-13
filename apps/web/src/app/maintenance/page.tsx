import type { Metadata } from 'next';
import { MaintenanceContent } from '@/components/status/maintenance-content';
import { MaintenanceLiveUpdates } from '@/components/status/maintenance-live-updates';
import { readMaintenanceWindow } from '@/lib/status/maintenance-mode';

export const metadata: Metadata = {
  title: 'Scheduled Maintenance | IntelliFlow CRM',
  description:
    'IntelliFlow CRM is performing scheduled maintenance. Review status, ETA, and affected services.',
  alternates: { canonical: '/maintenance' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function MaintenancePage() {
  const window = readMaintenanceWindow();

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(19,127,236,0.16),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-6 py-12 dark:bg-[radial-gradient(circle_at_top,_rgba(124,196,255,0.14),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <MaintenanceContent window={window} />
      {window.active && <MaintenanceLiveUpdates window={window} />}
    </main>
  );
}
