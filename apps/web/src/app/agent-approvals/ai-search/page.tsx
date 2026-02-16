'use client';

/**
 * AI Search Page (PG-144)
 *
 * Thin page shell — all logic in AISearchPage component and hooks.
 * Route: /agent-approvals/ai-search
 */

import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { AISearchPage } from '@/components/ai-intelligence/AISearchPage';
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

function AISearchPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return (
    <div>
      <AISearchPage />
    </div>
  );
}

export default function AISearchRoute() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AISearchPageContent />
    </Suspense>
  );
}
