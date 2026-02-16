'use client';

/**
 * AI Review History Page (PG-150)
 *
 * Thin page shell — all logic in ReviewHistory component and hooks.
 * Route: /agent-approvals/history
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { ReviewHistory } from '@/components/ai-intelligence/ReviewHistory';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ReviewHistoryPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div>
      <ReviewHistory />
    </div>
  );
}

export default function ReviewHistoryPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ReviewHistoryPageContent />
    </Suspense>
  );
}
