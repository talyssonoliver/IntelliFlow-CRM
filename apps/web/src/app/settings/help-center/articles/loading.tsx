import { Skeleton } from '@intelliflow/ui';

const SKELETON_KEYS = ['ld-0', 'ld-1', 'ld-2', 'ld-3', 'ld-4', 'ld-5'] as const;

export default function Loading() {
  return (
    <div className="w-full space-y-4 p-6" data-testid="help-article-loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="space-y-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
