import { Skeleton, Card } from '@intelliflow/ui';

/**
 * Bento-grid skeleton matching the real TicketSettingsContent layout so
 * no layout shift when the real data resolves. Mirrors the shape used by
 * AccountSettingsLoading (PG-183) / DealSettingsLoading (PG-184).
 */
export function TicketSettingsLoading() {
  return (
    <div className="w-full">
      <div className="mb-4">
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {[
          { span: 'lg:col-span-12', rows: 4 }, // SLA Policies
          { span: 'lg:col-span-7', rows: 4 }, // Duplicate Detection
          { span: 'lg:col-span-5', rows: 4 }, // Required Fields
          { span: 'lg:col-span-6', rows: 4 }, // Tags
          { span: 'lg:col-span-6', rows: 7 }, // Automation
        ].map((section, idx) => (
          <Card key={idx} className={`${section.span} p-4 sm:p-5`}>
            <div className="flex items-start gap-3 mb-5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-full max-w-[260px]" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: section.rows }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
