import { Card, Skeleton } from '@intelliflow/ui';

const ROW_KEYS = ['tm-row-0', 'tm-row-1', 'tm-row-2', 'tm-row-3'] as const;

/** Skeleton mirroring the territory page bento grid (AC-009). */
export function TerritoryMappingLoading() {
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading territory mapping">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-9 w-56" />
          {ROW_KEYS.map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </Card>
        <Card className="lg:col-span-4 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </Card>
        <Card className="lg:col-span-12 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    </div>
  );
}
