import { Suspense } from 'react';
import PerformanceReportView from '@/components/governance/PerformanceReportView';

export default function PerformancePage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Loading report...</p>
        </div>
      }
    >
      <PerformanceReportView />
    </Suspense>
  );
}
