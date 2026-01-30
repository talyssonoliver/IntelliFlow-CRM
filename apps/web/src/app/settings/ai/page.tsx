'use client';

/**
 * AI Settings Page
 *
 * PG-128: FLOW-045 AI Chain Versioning Admin UI
 *
 * Client component wrapper that dynamically loads the content component
 * with SSR disabled to prevent hydration issues with hooks.
 *
 * Pattern: Follows settings/pipeline/page.tsx structure
 */

import dynamic from 'next/dynamic';
import { Skeleton, Card } from '@intelliflow/ui';

// Dynamically import client component with SSR disabled
const AISettingsContent = dynamic(
  () => import('./AISettingsContent'),
  {
    ssr: false,
    loading: () => (
      <div className="settings_ai_page">
        <div className="max-w-5xl">
          {/* Header skeleton */}
          <div className="mb-8">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Tabs skeleton */}
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>

          {/* Dashboard skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

          {/* Stats skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-12" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    ),
  }
);

export default function AISettingsPage() {
  return <AISettingsContent />;
}
