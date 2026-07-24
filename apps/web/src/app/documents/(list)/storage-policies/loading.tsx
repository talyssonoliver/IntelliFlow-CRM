// Storage Policies Loading State — PG-206
// Skeleton matching the PageHeader + bento grid shape.

export default function StoragePoliciesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* Card skeleton */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
