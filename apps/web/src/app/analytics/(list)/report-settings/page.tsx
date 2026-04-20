// Report Settings Page — PG-187
// Server component + Suspense wrapper around the client orchestrator.

import { Suspense } from 'react';
import ReportSettingsContent from './ReportSettingsContent';
import ReportSettingsLoading from './loading';

export const metadata = {
  title: 'Report Settings — IntelliFlow',
  description:
    'Configure default date range, display currency, and scheduled delivery for analytics reports.',
};

export default function ReportSettingsPage() {
  return (
    <Suspense fallback={<ReportSettingsLoading />}>
      <ReportSettingsContent />
    </Suspense>
  );
}
