'use client';

/**
 * Agent Logs Page — PG-152
 *
 * Thin page shell with auth guard + Suspense boundary.
 * Route: /agent-approvals/logs
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { AgentLogsViewer } from '@/components/ai-monitoring/AgentLogsViewer';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function LogsPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  const searchParams = useSearchParams();
  const agentId = searchParams.get('agentId');

  if (authLoading) return <LoadingSkeleton />;
  return <AgentLogsViewer agentId={agentId} />;
}

export default function AgentLogsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LogsPageContent />
    </Suspense>
  );
}
