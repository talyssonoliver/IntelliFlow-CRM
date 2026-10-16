// Scheduled Reports loading skeleton — PG-201.
// Mirrors the bento shape (8 + 4 columns) so nothing shifts when data arrives.
// Used as the Suspense fallback of the (list) page and while the list loads.

import { Skeleton } from '@intelliflow/ui';

export default function ScheduledReportsLoading() {
  return (
    <output className="block w-full" aria-busy="true" aria-label="Loading scheduled reports">
      <span className="sr-only">Loading scheduled reports</span>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <Skeleton className="h-72 lg:col-span-8" />
        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </output>
  );
}
