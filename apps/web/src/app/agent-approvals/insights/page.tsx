'use client';

import { Suspense } from 'react';
import { InsightsListPage } from '@/components/insights/InsightsListPage';

export default function AgentApprovalsInsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              data-testid="insight-skeleton"
              className="animate-pulse flex gap-4 p-3 rounded-lg border border-slate-100 dark:border-slate-700"
            >
              <div className="shrink-0 w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      }
    >
      <InsightsListPage />
    </Suspense>
  );
}
