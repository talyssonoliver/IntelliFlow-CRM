import { PageHeader } from './page-header';

interface PlaceholderPageProps {
  taskId: string;
  title: string;
  description: string;
  group: string;
  sprint: number;
  breadcrumbs?: { label: string; href?: string }[];
}

/**
 * Reusable placeholder for pages not yet implemented.
 * Displays task ID, target sprint, and visual structure.
 */
export function PlaceholderPage({
  taskId,
  title,
  description,
  group,
  sprint,
  breadcrumbs,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
      />

      {/* Status Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start space-x-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Page Layout Defined</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This page layout is registered and ready for implementation.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Task ID</p>
                <p className="text-sm font-mono font-medium">{taskId}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Group</p>
                <p className="text-sm font-medium capitalize">{group}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Target Sprint</p>
                <p className="text-sm font-medium">Sprint {sprint}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-medium text-amber-600">Layout Ready</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wireframe Skeleton */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-24 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-24 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-24 rounded-lg bg-muted/50 animate-pulse" />
        </div>
        <div className="h-64 rounded-lg bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}
