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

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" /> // NOSONAR typescript:S6479
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" /> // NOSONAR typescript:S6479
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
