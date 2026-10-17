// Scheduled Reports Page — PG-201
// Server component: metadata + Suspense boundary.
// Content delegated to ScheduledReportsContent (client component).
// Placed under analytics/(list)/ to inherit ModuleGate("ANALYTICS") and the
// analytics settings sidebar.

import { Suspense } from 'react';
import type { Metadata } from 'next';
import ScheduledReportsContent from '@/app/analytics/scheduled-reports/ScheduledReportsContent';
import ScheduledReportsLoading from '@/app/analytics/scheduled-reports/loading';

export const metadata: Metadata = {
  title: 'Scheduled Reports',
  description:
    'Schedule report templates for delivery: cron cadence, timezone, recipients and delivery format.',
};

export default function ScheduledReportsPage() {
  return (
    <Suspense fallback={<ScheduledReportsLoading />}>
      <ScheduledReportsContent />
    </Suspense>
  );
}
