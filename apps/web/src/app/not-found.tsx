import Link from 'next/link';

/**
 * Custom 404 Page
 *
 * Server Component — renders when no route matches.
 */
export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center p-6">
      <div className="max-w-md w-full p-8 bg-white dark:bg-[#1e2936] border border-[#e2e8f0] dark:border-[#334155] rounded-xl shadow-sm text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#137fec]/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-[#137fec]">search_off</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Page not found</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#137fec] text-white font-medium rounded-lg hover:bg-[#0e6ac7] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">dashboard</span>
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#e2e8f0] dark:border-[#334155] text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-[#2d3a4a] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
