'use client';

/**
 * AI Review Queue Page (IFC-181)
 *
 * Thin page shell — all logic in ReviewQueue component and hooks.
 * Route: /agent-approvals/ai-review
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { ReviewQueue } from '@/components/ai-review';
import { Skeleton } from '@intelliflow/ui';

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
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

function AIReviewPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div className="p-6">
      <ReviewQueue />
    </div>
  );
}

export default function AIReviewPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AIReviewPageContent />
    </Suspense>
  );
}
