'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';

type PublicErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PublicHomeError({ error, reset }: PublicErrorProps) {
  useEffect(() => {
    console.error('Public home page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center px-6">
      <Card className="max-w-lg w-full p-8 bg-white dark:bg-[#1e2936] border border-border-light dark:border-border-dark text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400" aria-hidden="true">
            error
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
          <p className="text-slate-600 dark:text-slate-400">
            We couldn&apos;t load the public home experience. The event has been captured so we can
            keep governance and accessibility guardrails intact.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-slate-500 dark:text-slate-400 break-all">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#101922]"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              refresh
            </span>
            Try again
          </button>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border-light dark:border-border-dark text-slate-800 dark:text-slate-200 font-semibold hover:bg-slate-100 dark:hover:bg-[#2d3a4a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#101922]"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              support_agent
            </span>
            Contact support
          </Link>
        </div>
      </Card>
    </div>
  );
}
