import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import type { MaintenanceWindow } from '@/lib/status/maintenance-mode';

export type MaintenanceContentProps = {
  readonly window: MaintenanceWindow;
};

function formatEta(etaIso: string | null): string {
  if (!etaIso) return 'ETA unavailable';
  try {
    const date = new Date(etaIso);
    if (!Number.isFinite(date.getTime())) return 'ETA unavailable';
    return date.toUTCString();
  } catch {
    return 'ETA unavailable';
  }
}

export function MaintenanceContent({ window }: MaintenanceContentProps) {
  const isActive = window.active;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <Card className="overflow-hidden border border-slate-200 bg-white/95 shadow-xl shadow-[#137fec]/10 backdrop-blur dark:border-slate-700 dark:bg-slate-950/90">
        <div className="px-6 py-8 lg:px-10 lg:py-10">
          <div className="space-y-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                construction
              </span>
              {isActive ? 'Maintenance in progress' : 'All systems nominal'}
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {isActive ? 'Scheduled maintenance' : 'No maintenance currently scheduled'}
            </h1>

            <section
              aria-live="polite"
              aria-atomic="true"
              className="mx-auto max-w-2xl space-y-4 text-left"
            >
              {isActive ? (
                <>
                  <p className="text-base text-slate-600 dark:text-slate-300 sm:text-lg">
                    {window.message}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                          schedule
                        </span>
                        Estimated completion
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                        {formatEta(window.etaIso)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                          tune
                        </span>
                        Affected services
                      </p>
                      {window.affectedServices.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {window.affectedServices.map((service) => (
                            <li
                              key={service}
                              className="rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {service}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                          No services listed
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-base text-slate-600 dark:text-slate-300 sm:text-lg">
                  IntelliFlow CRM is running normally. Visit the status page for live signals and
                  the latest incident history.
                </p>
              )}
            </section>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/status"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#137fec] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#0e6ac7] focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  monitoring
                </span>
                Check status page
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
        </div>
      </Card>
    </div>
  );
}
