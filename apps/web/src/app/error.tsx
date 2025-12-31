'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';

/**
 * Error boundary for home page
 * Displays a user-friendly error message with recovery options
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to error reporting service (e.g., Sentry)
    console.error('Home page error:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-red-600 dark:text-red-400">
            error
          </span>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          We encountered an error while loading the page. This has been logged and we'll look into it.
        </p>

        {/* Error Details (dev only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-left">
            <p className="text-xs font-mono text-red-800 dark:text-red-300 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#137fec] text-white font-medium rounded-lg hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-[#2d3a4a] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">dashboard</span>
            Go to Dashboard
          </Link>
        </div>

        {/* Support Link */}
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-6">
          Need help?{' '}
          <Link
            href="/support"
            className="text-[#137fec] hover:underline font-medium"
          >
            Contact Support
          </Link>
        </p>
      </Card>
    </div>
  );
}
