'use client';

import { buildContactMapsHref } from './contact-detail-actions';

// Re-export so the route page can import the location composer alongside this
// component in one statement (keeps the lcov-excluded page.tsx diff minimal).
export { buildContactLocation } from './contact-detail-actions';

export interface ContactMapPreviewProps {
  /**
   * The contact's location string. Currently always empty (the contact
   * view-model hardcodes `''` until IFC-259 wires it from the API), so the
   * control renders disabled until a real location is available.
   */
  location: string | null | undefined;
}

/**
 * IFC-257: the Contact 360 left-sidebar map preview. Renders the gradient map
 * placeholder + a "View Map" control. Extracted from the route page so the
 * wiring is unit-tested and counted by the merged coverage report.
 *
 * The control opens Google Maps for the contact's location in a new tab; it is
 * `disabled` (never a deceptive no-op) when no location is available.
 */
export function ContactMapPreview({ location }: Readonly<ContactMapPreviewProps>) {
  const mapsHref = buildContactMapsHref(location);

  return (
    <div className="h-32 w-full bg-cover bg-center border-t border-slate-200 dark:border-slate-800 relative">
      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-8 h-8 text-[#137fec] mx-auto mb-1"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 12q.825 0 1.413-.587Q14 10.825 14 10t-.587-1.413Q12.825 8 12 8t-1.412.587Q10 9.175 10 10t.588 1.413Q11.175 12 12 12Zm0 9.625q-.2 0-.4-.075t-.35-.2Q7.6 18.125 5.8 15.362 4 12.6 4 10.2q0-3.75 2.413-5.975Q8.825 2 12 2t5.588 2.225Q20 6.45 20 10.2q0 2.4-1.8 5.163-1.8 2.762-5.45 5.987-.15.125-.35.2-.2.075-.4.075Z" />
          </svg>
          <button
            type="button"
            disabled={!mapsHref}
            onClick={
              mapsHref ? () => window.open(mapsHref, '_blank', 'noopener,noreferrer') : undefined
            }
            title={mapsHref ? 'Open location in Google Maps' : 'Location unavailable'}
            className="bg-white/90 text-slate-900 text-xs font-bold px-3 py-1.5 rounded shadow-sm hover:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            View Map
          </button>
        </div>
      </div>
    </div>
  );
}
