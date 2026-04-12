'use client';

/**
 * Experiments Page (PG-149)
 *
 * Thin page shell — all logic in ExperimentsDashboard component and hooks.
 * Route: /agent-approvals/experiments
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { ExperimentsDashboard } from '@/components/ai-intelligence/ExperimentsDashboard';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" /> // NOSONAR typescript:S6479
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" /> // NOSONAR typescript:S6479
        ))}
      </div>
    </div>
  );
}

function ExperimentsPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return <ExperimentsDashboard />;
}

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ExperimentsPageContent />
    </Suspense>
  );
}
