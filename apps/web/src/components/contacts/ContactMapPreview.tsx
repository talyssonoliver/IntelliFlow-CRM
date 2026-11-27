'use client';

import { buildContactMapsHref } from './contact-detail-actions';

// Re-export so the route page can import the location composer alongside this
// component in one statement (keeps the lcov-excluded page.tsx diff minimal).
export { buildContactLocation } from './contact-detail-actions';

export interface ContactMapPreviewProps {
  /** The lead's or contact's location string; empty when there is none. */
  location: string | null | undefined;
}

const PIN_PATH =
  'M12 12q.825 0 1.413-.587Q14 10.825 14 10t-.587-1.413Q12.825 8 12 8t-1.412.587Q10 9.175 10 10t.588 1.413Q11.175 12 12 12Zm0 9.625q-.2 0-.4-.075t-.35-.2Q7.6 18.125 5.8 15.362 4 12.6 4 10.2q0-3.75 2.413-5.975Q8.825 2 12 2t5.588 2.225Q20 6.45 20 10.2q0 2.4-1.8 5.163-1.8 2.762-5.45 5.987-.15.125-.35.2-.2.075-.4.075Z';

const CONTROL =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50';

/**
 * The location card on a lead's or contact's sidebar. It shows the address itself with a pin, not a
 * picture of a map that is not there, and "View Map" is a real link to Google Maps for that address:
 * an anchor works on every phone browser (iOS Safari blocks a window.open that follows an await),
 * and opens in a new tab. With no address the control is `disabled`, never a no-op that looks live.
 */
export function ContactMapPreview({ location }: Readonly<ContactMapPreviewProps>) {
  const mapsHref = buildContactMapsHref(location);
  const address = (location ?? '').trim();

  return (
    <div className="w-full border-t border-slate-200 dark:border-slate-800 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 px-4 py-4">
      <div className="flex items-start gap-3">
        <svg
          aria-hidden="true"
          className="mt-0.5 h-7 w-7 shrink-0 text-[#2a78f6]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d={PIN_PATH} />
        </svg>
        <p className="min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">
          {address || 'No address on file'}
        </p>
      </div>
      <div className="mt-3">
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Open location in Google Maps"
            className={CONTROL}
          >
            View Map
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Location unavailable"
            className={`${CONTROL} cursor-not-allowed opacity-60`}
          >
            View Map
          </button>
        )}
      </div>
    </div>
  );
}
