/**
 * Loading placeholder for the home page's Quick Actions card: a title bar and a 2x2 grid of
 * action tiles. Shared by the app-wide loading screen (app/loading.tsx) and the signed-in home's
 * own (app/(signed-in)/signed-in-home/loading.tsx), which drew the same markup twice.
 */
export function QuickActionsCardSkeleton() {
  return (
    <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
      <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
