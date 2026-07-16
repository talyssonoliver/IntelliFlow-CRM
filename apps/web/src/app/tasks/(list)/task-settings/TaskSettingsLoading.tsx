export default function TaskSettingsLoading() {
  return (
    <div className="w-full" aria-hidden="true">
      <div className="mb-6">
        <div className="h-7 bg-muted animate-pulse rounded-md w-64 mb-2" />
        <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
        <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
        <div className="lg:col-span-12 h-64 bg-muted animate-pulse rounded-md" />
      </div>
    </div>
  );
}
