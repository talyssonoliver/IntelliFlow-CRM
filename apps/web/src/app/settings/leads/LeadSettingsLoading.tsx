import { Skeleton, Card } from '@intelliflow/ui';

export function LeadSettingsLoading() {
  return (
    <div className="max-w-7xl">
      {/* Breadcrumb skeleton */}
      <div className="mb-4">
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* Tabs skeleton */}
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
          </div>

          {/* Content skeleton */}
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-32 mx-auto" />
          </Card>
        </div>
      </div>
    </div>
  );
}
