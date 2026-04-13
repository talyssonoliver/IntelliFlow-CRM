'use client';

/**
 * Active Agents Page — PG-151
 *
 * Thin page shell with auth guard + Suspense boundary.
 * Route: /agent-approvals/agents
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { ActiveAgentsDashboard } from '@/components/ai-monitoring/ActiveAgentsDashboard';
import { Skeleton } from '@intelliflow/ui';

const GRID_SKELETON_KEYS = ['grid-0', 'grid-1', 'grid-2', 'grid-3', 'grid-4'] as const;
const LIST_SKELETON_KEYS = ['list-0', 'list-1', 'list-2'] as const;

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {GRID_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">
        {LIST_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ActiveAgentsContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return <ActiveAgentsDashboard />;
}

export default function ActiveAgentsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ActiveAgentsContent />
    </Suspense>
  );
}
