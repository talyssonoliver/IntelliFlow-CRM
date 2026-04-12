import type { Metadata } from 'next';
import { ErrorPageContent } from '@/components/status/error-page-content';

export const metadata: Metadata = {
  title: 'Server Error | IntelliFlow CRM',
  description:
    'An internal error was reported. Recover with guided next steps while the incident is logged.',
  alternates: { canonical: '/500' },
  robots: { index: false, follow: false },
};

// Note: the direct /500 route intentionally does NOT mount <ServerIncidentReporter>.
// Incidents are only reported from real runtime error boundaries (error.tsx,
// global-error.tsx) so that bookmarked, linked, or typo'd visits to /500 do not
// pollute analytics or trigger SRE webhook pages.
export default function ServerErrorPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.16),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-6 py-12 dark:bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.14),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <ErrorPageContent variant="route" />
    </main>
  );
}
