// Report Settings Loading Skeleton — PG-187
// Next.js loading.tsx convention — shown while ReportSettingsContent Suspense resolves.

export default function ReportSettingsLoading() {
  return (
    <div className="max-w-7xl p-6" aria-busy="true" aria-label="Loading report settings">
      <div className="h-5 w-40 bg-muted animate-pulse rounded-sm mb-4" />
      <div className="h-8 w-60 bg-muted animate-pulse rounded-sm mb-2" />
      <div className="h-4 w-80 bg-muted animate-pulse rounded-sm mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-10 bg-muted animate-pulse rounded-md" />
          <div className="h-64 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="lg:col-span-1">
          <div className="h-40 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    </div>
  );
}
