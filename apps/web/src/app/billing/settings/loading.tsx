// Billing Settings Loading — PG-188
// Skeleton matching the PageHeader + 12-col bento grid shape of BillingSettings.
export default function BillingSettingsLoading() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <div className="h-4 bg-muted animate-pulse rounded-md w-48 mb-3" />
        <div className="h-7 bg-muted animate-pulse rounded-md w-64 mb-2" />
        <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className="lg:col-span-7 h-64 bg-muted animate-pulse rounded-md" />
        <div className="lg:col-span-5 h-48 bg-muted animate-pulse rounded-md" />
      </div>
    </div>
  );
}
