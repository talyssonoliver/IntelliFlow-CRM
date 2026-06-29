// Report Templates Page — PG-200
// Server component: metadata + Suspense boundary.
// Content delegated to ReportTemplatesContent (client component).
// Placed under analytics/(list)/ to inherit ModuleGate("ANALYTICS").

import { Suspense } from 'react';
import type { Metadata } from 'next';
import ReportTemplatesContent from '@/app/analytics/report-templates/ReportTemplatesContent';
import ReportTemplatesLoading from '@/app/analytics/report-templates/loading';

export const metadata: Metadata = {
  title: 'Report Templates',
  description:
    'Create and manage saveable report layouts: filter set, columns, chart type, and default period.',
};

export default function ReportTemplatesPage() {
  return (
    <Suspense fallback={<ReportTemplatesLoading />}>
      <ReportTemplatesContent />
    </Suspense>
  );
}
