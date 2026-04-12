'use client';

import dynamic from 'next/dynamic';
import { Skeleton, Card } from '@intelliflow/ui';

const PipelineSettingsContent = dynamic(
  () => import('@/app/settings/pipeline/PipelineSettingsContent'),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-3xl">
        <div className="mb-8">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </Card>
      </div>
    ),
  }
);

export default function PipelineSettingsPage() {
  return <PipelineSettingsContent />;
}
