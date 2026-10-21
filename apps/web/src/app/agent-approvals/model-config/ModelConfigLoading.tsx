import { Card, Skeleton } from '@intelliflow/ui';

const CARD_KEYS = [
  'mc-scoring',
  'mc-qualification',
  'mc-email',
  'mc-reasoning',
  'mc-structured',
  'mc-rag',
] as const;

/** Skeleton mirroring the model configuration bento: one card per AI purpose (AC-001). */
export function ModelConfigLoading() {
  return (
    <>
      <output className="sr-only">Loading model configuration…</output>
      <div className="w-full" aria-busy="true">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {CARD_KEYS.map((key) => (
            <Card key={key} className="lg:col-span-6 p-4 sm:p-5 space-y-3">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
