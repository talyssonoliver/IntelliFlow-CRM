/**
 * PinnedSkeleton — loading placeholder for the home page "Pinned" section.
 *
 * Deliberately lives in its OWN module, separate from PinnedItemsDndRegion, and
 * imports NO @dnd-kit. AuthenticatedHomePage imports this skeleton STATICALLY
 * (for the dynamic() loading fallback). If the skeleton were co-located with the
 * @dnd-kit-importing PinnedSection, that static edge would pull @dnd-kit into the
 * home page's initial chunk and defeat the PERF-05 lazy-load entirely — the
 * dynamic() import would then reference an already-bundled module and split
 * nothing. Keeping the skeleton @dnd-kit-free is exactly what lets
 * `dynamic(() => import('./PinnedItemsDndRegion'), { ssr: false })` actually
 * defer @dnd-kit into a separate chunk. Do not merge this back into
 * PinnedItemsDndRegion.
 */

export function PinnedSkeleton() {
  return (
    <>
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
          <div className="size-8 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
