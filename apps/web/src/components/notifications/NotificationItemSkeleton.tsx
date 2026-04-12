import { Skeleton } from '@intelliflow/ui';

/** Loading placeholder matching the NotificationItem layout */
export function NotificationItemSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
