'use client';

/**
 * Drift Detection Dashboard Page (PG-146)
 *
 * Thin page shell — all logic in DriftDashboard component and hooks.
 * Route: /agent-approvals/drift
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { DriftDashboard } from '@/components/ai-monitoring/DriftDashboard';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" /> // NOSONAR typescript:S6479
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" /> // NOSONAR typescript:S6479
        ))}
      </div>
    </div>
  );
}

function DriftPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div>
      <DriftDashboard />
    </div>
  );
}

export default function DriftDetectionDashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DriftPageContent />
    </Suspense>
  );
}
