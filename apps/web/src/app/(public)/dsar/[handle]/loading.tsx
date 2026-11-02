/** Skeleton for the public data request pages (PG-203 DSAR) while the route streams. */
export default function DsarLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <h1 className="sr-only">Data request</h1>
      <output className="sr-only">Loading</output>
      <div className="space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse motion-reduce:animate-none rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse motion-reduce:animate-none rounded bg-muted" />
        <div className="h-64 animate-pulse motion-reduce:animate-none rounded-lg bg-muted" />
      </div>
    </main>
  );
}
