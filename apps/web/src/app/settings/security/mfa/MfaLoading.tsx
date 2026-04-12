import { Skeleton, Card } from '@intelliflow/ui';

export function MfaLoading() {
  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56 mb-1" />
        <Skeleton className="h-9 w-64 mb-2" />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Status + Methods */}
        <Card className="lg:col-span-7 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </Card>

        {/* Backup codes */}
        <Card className="lg:col-span-5 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>

        {/* Add method + Danger zone */}
        <Card className="lg:col-span-6 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
        <Card className="lg:col-span-6 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    </div>
  );
}
