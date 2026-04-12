/**
 * Root loading skeleton for the home page route
 *
 * Uses white/light background matching the authenticated dashboard grid layout.
 * Prevents CLS for authenticated users who would otherwise see the public
 * page's dark gradient skeleton during JS bundle resolution.
 *
 * The public route group loading at (public)/loading.tsx is LEFT UNCHANGED
 * and continues to serve /login, /signup etc.
 *
 * PG-166: NF-008 compliance
 */
export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f6f7f8] dark:bg-[#101922]">
      <div className="px-4 sm:px-6 lg:px-8 xl:px-12 py-6 max-w-[1800px] mx-auto animate-pulse">
        {/* Welcome Banner Skeleton */}
        <div className="bg-gradient-to-r from-[#137fec]/20 to-indigo-600/20 rounded-xl p-8 mb-6">
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
          <div className="h-10 w-72 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
          <div className="h-5 w-96 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
          <div className="flex gap-3">
            <div className="h-10 w-36 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-10 w-36 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>

        {/* Dashboard Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
          {/* AI Insights - 3 cols */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] dark:border-[#334155]">
              <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="p-4 space-y-3">
              <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>

          {/* Quick Actions - 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Feed - 3 cols */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 row-span-2 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
            <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155]">
              <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="p-5 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Focus - 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto mb-4" />
          </div>

          {/* Pinned - 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
