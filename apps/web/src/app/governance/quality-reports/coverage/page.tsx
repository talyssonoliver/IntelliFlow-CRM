import { Suspense } from 'react';
import CoverageReportView from '@/components/governance/CoverageReportView';

export default function CoveragePage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Loading report...</p>
        </div>
      }
    >
      <CoverageReportView />
    </Suspense>
  );
}
