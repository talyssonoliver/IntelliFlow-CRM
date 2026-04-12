export default function Loading() {
  return (
    <div className="flex-1 animate-pulse p-4 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>

      {/* Reminder banner skeleton */}
      <div className="h-14 bg-muted rounded-lg" />

      {/* Search / filter bar skeleton */}
      <div className="flex gap-3">
        <div className="h-10 flex-1 bg-muted rounded-lg" />
        <div className="h-10 w-28 bg-muted rounded-lg" />
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="h-[400px] bg-muted rounded-lg" />
    </div>
  );
}
