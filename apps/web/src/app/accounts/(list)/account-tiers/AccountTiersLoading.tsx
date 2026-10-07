import { Card, Skeleton } from '@intelliflow/ui';

/** Skeleton with the same bento spans as the loaded page (8/4/6/6), so nothing shifts. */
export const TIER_LOADING_SECTIONS = [
  { span: 'lg:col-span-8', rows: 4 },
  { span: 'lg:col-span-4', rows: 2 },
  { span: 'lg:col-span-6', rows: 3 },
  { span: 'lg:col-span-6', rows: 3 },
] as const;

export function AccountTiersLoading() {
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading account tiers">
      <div className="mb-4">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {TIER_LOADING_SECTIONS.map((section) => (
          <Card
            key={section.span + section.rows}
            data-testid="tier-skeleton-card"
            className={`${section.span} p-4 sm:p-5`}
          >
            <div className="flex items-start gap-3 mb-5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-full max-w-[260px]" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: section.rows }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
