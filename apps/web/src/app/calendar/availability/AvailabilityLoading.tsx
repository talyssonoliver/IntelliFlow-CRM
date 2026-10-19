import { Card, Skeleton } from '@intelliflow/ui';

const DAY_KEYS = [
  'av-day-0',
  'av-day-1',
  'av-day-2',
  'av-day-3',
  'av-day-4',
  'av-day-5',
  'av-day-6',
] as const;
const CLOSURE_KEYS = ['av-closure-0', 'av-closure-1'] as const;
const FIELD_KEYS = ['av-field-0', 'av-field-1', 'av-field-2'] as const;

/** Skeleton mirroring the availability bento grid (8 / 4 / 8 / 4), so nothing shifts when data lands. */
export function AvailabilityLoading() {
  return (
    <div className="w-full" aria-busy="true">
      <output className="sr-only">Loading availability</output>
      <div aria-hidden="true">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <Card className="lg:col-span-8 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-56" />
            {DAY_KEYS.map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </Card>
          <Card className="lg:col-span-4 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-10 w-full" />
          </Card>
          <Card className="lg:col-span-8 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-48" />
            {CLOSURE_KEYS.map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </Card>
          <Card className="lg:col-span-4 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-44" />
            {FIELD_KEYS.map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
