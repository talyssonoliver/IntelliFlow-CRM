// Task Automation loading skeleton — PG-208.
// Mirrors the bento shape (8 rules + 4 settings/tags) so nothing shifts when data
// arrives. Suspense fallback of page.tsx, route loading.tsx, and while the list loads.

import { Skeleton } from '@intelliflow/ui';

export default function TaskAutomationLoading() {
  return (
    <output className="block w-full" aria-busy="true" aria-label="Loading task automation">
      <span className="sr-only">Loading task automation</span>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <Skeleton className="h-72 lg:col-span-8" data-testid="skeleton-rules" />
        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-4">
          <Skeleton className="h-56" data-testid="skeleton-settings" />
          <Skeleton className="h-28" data-testid="skeleton-tags" />
        </div>
      </div>
    </output>
  );
}
