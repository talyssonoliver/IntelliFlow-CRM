import Link from 'next/link';
import { Card } from '@intelliflow/ui';

export type ErrorPageContentProps = {
  readonly error?: Error & { digest?: string };
  readonly onReset?: () => void;
  readonly showDetails?: boolean;
  readonly variant?: 'boundary' | 'route';
};

export function ErrorPageContent({
  error,
  onReset,
  showDetails = false,
  variant = 'route',
}: ErrorPageContentProps) {
  const isBoundary = variant === 'boundary';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <Card className="overflow-hidden border border-slate-200 bg-white/95 shadow-xl shadow-red-500/10 backdrop-blur dark:border-slate-700 dark:bg-slate-950/90">
        <div className="px-6 py-8 lg:px-10 lg:py-10">
          <div className="space-y-6 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                report
              </span>{' '}
              Server error
            </div>

            {/* Heading */}
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {isBoundary ? 'Something went wrong' : 'Server error'}
            </h1>

            {/* Description */}
            <p className="mx-auto max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
              {isBoundary
                ? 'We encountered an error while loading the page. This has been logged and our team has been notified.'
                : 'An internal error was reported. Our team has been notified and is looking into it. Use the links below to recover.'}
            </p>

            {/* Error Details (dev only) */}
            {showDetails && error && (
              <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-left dark:border-red-800 dark:bg-red-900/10">
                <p className="break-all font-mono text-xs text-red-800 dark:text-red-300">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              {isBoundary && onReset ? (
                <button
                  onClick={onReset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#137fec] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#0e6ac7] focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    refresh
                  </span>{' '}
                  Try again
                </button>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#137fec] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#0e6ac7] focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    dashboard
                  </span>{' '}
                  Go to Dashboard
                </Link>
              )}
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  home
                </span>{' '}
                Back to Home
              </Link>
            </div>

            {/* Support Link */}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Need help?{' '}
              <Link
                href="/support"
                className="font-medium text-[#137fec] hover:underline focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 rounded"
              >
                Contact Support
              </Link>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
