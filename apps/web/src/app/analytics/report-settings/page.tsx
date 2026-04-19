// Report Settings Page — PG-187
// Replaces the 19-line stub at this path with a Suspense-wrapped client component.

import { Suspense } from 'react';
import ReportSettingsContent from './ReportSettingsContent';
import ReportSettingsLoading from './loading';

export const metadata = {
  title: 'Report Settings — IntelliFlow',
  description:
    'Configure default date range, currency, and scheduled delivery for analytics reports.',
};

export default function ReportSettingsPage() {
  return (
    <Suspense fallback={<ReportSettingsLoading />}>
      <ReportSettingsContent />
    </Suspense>
  );
}
