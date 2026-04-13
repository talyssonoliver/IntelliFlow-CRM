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

const GRID_SKELETON_KEYS = ['grid-0', 'grid-1', 'grid-2', 'grid-3'] as const;
const LIST_SKELETON_KEYS = ['list-0', 'list-1', 'list-2'] as const;

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {GRID_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-3">
        {LIST_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-32 w-full rounded-lg" />
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
