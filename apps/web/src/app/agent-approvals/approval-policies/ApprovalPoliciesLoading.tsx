import { Card, Skeleton } from '@intelliflow/ui';

const ROW_KEYS = ['ap-row-0', 'ap-row-1'] as const;
const SCOPE_KEYS = ['ap-scope-agent', 'ap-scope-email'] as const;

/** Skeleton mirroring the approval policies bento grid (AC-001). */
export function ApprovalPoliciesLoading() {
  return (
    <>
      <output className="sr-only">Loading approval policies…</output>
      <div className="w-full" aria-busy="true">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {SCOPE_KEYS.map((scope) => (
            <Card key={scope} className="lg:col-span-6 p-4 sm:p-5 space-y-3">
              <Skeleton className="h-9 w-56" />
              {ROW_KEYS.map((key) => (
                <Skeleton key={key} className="h-24 w-full" />
              ))}
            </Card>
          ))}
          <Card className="lg:col-span-12 p-4 sm:p-5 space-y-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-32 w-full" />
          </Card>
        </div>
      </div>
    </>
  );
}
