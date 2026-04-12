export default function Loading() {
  return (
    <div className="flex-1 animate-pulse p-4 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>

      {/* Content skeleton */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>

      <div className="h-[400px] bg-muted rounded-lg" />
    </div>
  );
}
