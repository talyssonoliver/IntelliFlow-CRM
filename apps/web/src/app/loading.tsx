/**
 * Loading state for home page
 * Displays a skeleton UI while the page loads
 */
export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f6f7f8] dark:bg-[#101922] animate-pulse">
      {/* Hero Section Skeleton */}
      <div className="bg-gradient-to-br from-[#137fec]/10 to-indigo-500/10 dark:from-[#137fec]/20 dark:to-indigo-500/20">
        <div className="container mx-auto px-6 py-16 lg:py-24">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge skeleton */}
            <div className="inline-flex w-32 h-8 bg-slate-200 dark:bg-slate-700 rounded-full mb-6" />

            {/* Title skeleton */}
            <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-6 max-w-2xl mx-auto" />
            <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-6 max-w-xl mx-auto" />

            {/* Description skeleton */}
            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-2 max-w-2xl mx-auto" />
            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-8 max-w-lg mx-auto" />

            {/* Button skeletons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="w-48 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="w-36 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Skeleton */}
      <div className="container mx-auto px-6 -mt-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-6 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="w-16 h-6 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 w-24" />
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Features Section Skeleton */}
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4 max-w-md mx-auto" />
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded max-w-2xl mx-auto" />
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-6 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg"
            >
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4" />
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
