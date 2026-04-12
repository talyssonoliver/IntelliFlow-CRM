import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { SearchSuggestions } from '@/components/status/search-suggestions';
import { NotFoundAnalytics } from '@/components/status/not-found-analytics';

export const metadata: Metadata = {
  title: 'Page Not Found | IntelliFlow CRM',
  description:
    'Recover from missing links with guided next steps and real IntelliFlow destinations.',
  alternates: {
    canonical: '/404',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFoundPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(19,127,236,0.16),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-6 py-12 dark:bg-[radial-gradient(circle_at_top,_rgba(124,196,255,0.14),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Card className="overflow-hidden border border-slate-200 bg-white/95 shadow-xl shadow-[#137fec]/10 backdrop-blur dark:border-slate-700 dark:bg-slate-950/90">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#137fec]/20 bg-[#137fec]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#137fec]">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  route
                </span>
                Missing route
              </div>

              <div className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                  Page not found
                </h1>
                <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
                  The link you followed does not exist anymore, or it never belonged to this
                  workspace. Use one of the real destinations below to get back on track.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#137fec] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#0e6ac7] focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    dashboard
                  </span>
                  Go to Dashboard
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    home
                  </span>
                  Back to Home
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Fast recovery
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">&lt;200ms</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Keep the 404 response lightweight and readable on any device.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Guided routing
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">4</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Suggested destinations pulled from real IntelliFlow routes.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Route signal
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Live</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Structured missing-page analytics are emitted when a sink is available.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 bg-white/95 px-6 py-6 shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-950/90 dark:shadow-none">
          <SearchSuggestions />
        </Card>
      </div>

      <NotFoundAnalytics suggestionCount={4} />
    </main>
  );
}
