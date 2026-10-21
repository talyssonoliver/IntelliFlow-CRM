/** Skeleton for the public booking page (PG-203) while the route streams. */
export default function BookingLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <output className="sr-only">Loading booking page</output>
      <div className="space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
