import { Suspense } from 'react';
import QualityReportDetailClient from './QualityReportDetailClient';

export default function QualityReportDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Loading report...</p>
        </div>
      }
    >
      <QualityReportDetailClient />
    </Suspense>
  );
}
