import { Card, Skeleton } from '@intelliflow/ui';

const HALF_CARDS = ['es-card-0', 'es-card-1', 'es-card-2', 'es-card-3'] as const;

/** Skeleton mirroring the Email Settings bento (mailbox, four half cards, suppression list). */
export function EmailSettingsLoading() {
  return (
    <div className="w-full" aria-busy="true">
      <output className="sr-only">Loading email settings</output>
      <div aria-hidden="true">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <Card className="lg:col-span-12 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-10 w-full" />
          </Card>
          {HALF_CARDS.map((key) => (
            <Card key={key} className="lg:col-span-6 p-4 sm:p-5 space-y-3">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
          <Card className="lg:col-span-12 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-10 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}
