import { Suspense } from 'react';
import LighthouseReportView from '@/components/governance/LighthouseReportView';

export default function LighthousePage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Loading report...</p>
        </div>
      }
    >
      <LighthouseReportView />
    </Suspense>
  );
}
