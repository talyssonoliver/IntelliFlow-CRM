import { Suspense } from 'react';
import TRPCBenchmarkReportView from '@/components/governance/TRPCBenchmarkReportView';

export default function TRPCBenchmarkPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Loading report...</p>
        </div>
      }
    >
      <TRPCBenchmarkReportView />
    </Suspense>
  );
}
