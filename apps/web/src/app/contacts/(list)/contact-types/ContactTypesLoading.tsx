import { Card, Skeleton } from '@intelliflow/ui';

const ROW_KEYS = ['cty-row-0', 'cty-row-1', 'cty-row-2', 'cty-row-3'] as const;
const DEFAULT_KEYS = ['cty-default-0', 'cty-default-1', 'cty-default-2'] as const;

/** Skeleton mirroring the contact types bento grid (no layout shift when data lands). */
export function ContactTypesLoading() {
  return (
    <div className="w-full" aria-busy="true">
      <h1 className="sr-only">Contact Types</h1>
      <output className="sr-only">Loading contact types</output>
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
          {DEFAULT_KEYS.map((key) => (
            <Skeleton key={key} className="h-6 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
