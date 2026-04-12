'use client';

/**
 * Latency Monitor Dashboard Page (PG-153)
 *
 * Thin page shell — all logic in LatencyMonitorDashboard component and hooks.
 * Route: /agent-approvals/latency
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { LatencyMonitorDashboard } from '@/components/ai-monitoring/LatencyMonitorDashboard';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
        ))}
      </div>
    </div>
  );
}

function LatencyPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div>
      <LatencyMonitorDashboard />
    </div>
  );
}

export default function LatencyMonitorDashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LatencyPageContent />
    </Suspense>
  );
}
