'use client';

import dynamic from 'next/dynamic';
import { Skeleton, Card } from '@intelliflow/ui';

const AISettingsContent = dynamic(
  () => import('@/components/ai-agents/ai-settings/AISettingsContent'),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-5xl">
        <div className="mb-8">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    ),
  }
);

export default function AISettingsPage() {
  return <AISettingsContent />;
}
