/**
 * Home page loading skeleton — scoped to `/` only via the `(home)` nested
 * route group. Other routes in `(public)/` (login, pricing, etc.) continue
 * to use the dark marketing skeleton at `(public)/loading.tsx`.
 *
 * This skeleton mirrors the layout of `<AuthenticatedHomePage />` — welcome
 * banner, AI insights card, quick actions, activity feed, today's focus, and
 * pinned items — so authenticated users see a congruent loading state. For
 * unauthenticated visitors the server-side path check in `page.tsx` renders
 * the public marketing page directly; this skeleton is only visible briefly
 * during the RSC payload fetch while data is prefetched server-side.
 *
 * Theme-aware: uses the same design tokens (`bg-[#f6f7f8] dark:bg-[#101922]`,
 * card colours, border colours) as `AuthenticatedHomePage` so there is zero
 * visual drift between skeleton and final content.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <div className="px-4 sm:px-6 lg:px-8 xl:px-12 py-6 max-w-[1800px] mx-auto animate-pulse">
        {/* Welcome Banner Skeleton — matches gradient blue banner */}
        <div className="bg-gradient-to-r from-[#137fec] to-indigo-600 rounded-xl p-8 mb-6 shadow-lg relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            {/* Greeting label (Good morning / Good afternoon) */}
            <div className="h-4 w-32 bg-white/25 rounded" />
            {/* Welcome back, Name! */}
            <div className="h-10 w-72 bg-white/30 rounded-lg" />
            {/* Welcome message line */}
            <div className="h-5 w-96 bg-white/20 rounded" />
            <div className="h-5 w-64 bg-white/20 rounded" />
          </div>
        </div>

        {/* Dashboard Grid Skeleton — matches AuthenticatedHomePage layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
          {/* AI Insights card — spans 3 cols */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] dark:border-[#334155] flex items-center justify-between">
              <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="p-4 space-y-3">
              <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>

          {/* Quick Actions card — 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Activity Feed card — spans 3 cols, 2 rows */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 row-span-2 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
            <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex items-center justify-between">
              <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-8 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
            <div className="p-5 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Focus card — 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto mb-4" />
            <div className="space-y-2">
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
            </div>
          </div>

          {/* Pinned items card — 1 col */}
          <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
