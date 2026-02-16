'use client';

/**
 * Lead Scoring Dashboard Page (PG-148)
 *
 * Thin page shell — all logic in LeadScoringDashboard component and hooks.
 * Route: /agent-approvals/lead-scoring
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { LeadScoringDashboard } from '@/components/ai-intelligence/LeadScoringDashboard';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function LeadScoringPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div>
      <LeadScoringDashboard />
    </div>
  );
}

export default function LeadScoringDashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LeadScoringPageContent />
    </Suspense>
  );
}
