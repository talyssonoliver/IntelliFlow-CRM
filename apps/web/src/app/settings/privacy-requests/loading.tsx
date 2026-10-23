/** Skeleton for the privacy requests settings page (PG-203 DSAR). */
export default function PrivacyRequestsLoading() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="sr-only">Privacy requests</h1>
      <output className="sr-only">Loading</output>
      <div className="space-y-4" aria-hidden="true">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
