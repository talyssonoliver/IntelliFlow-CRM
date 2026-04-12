'use client';

/**
 * Lead Routing Settings Page
 *
 * PG-132: Smart Lead Routing UI
 *
 * Client component wrapper that dynamically loads the content component
 * with SSR disabled to prevent hydration issues with hooks.
 */

import dynamic from 'next/dynamic';
import { Skeleton, Card } from '@intelliflow/ui';

const RoutingContent = dynamic(() => import('./RoutingContent'), {
  ssr: false,
  loading: () => (
    <div className="settings_routing_page">
      <div className="max-w-5xl">
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
    </div>
  ),
});

export default function RoutingPage() {
  return <RoutingContent />;
}
