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

const GRID_SKELETON_KEYS = ['grid-0', 'grid-1', 'grid-2', 'grid-3', 'grid-4'] as const;
const LIST_SKELETON_KEYS = ['list-0', 'list-1', 'list-2'] as const;

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {GRID_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="space-y-3">
        {LIST_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-36 w-full rounded-lg" />
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
