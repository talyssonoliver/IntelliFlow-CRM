'use client';

import { useState } from 'react';

/**
 * One collapsed line for the activity the system wrote on a lead (COA sync, portal, AI scores,
 * status changes): "System updates (n)", expanding to the entries themselves.
 */
export function SystemUpdatesGroup({
  count,
  children,
}: Readonly<{ count: number; children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
            settings
          </span>
          System updates ({count})
        </span>
        <span
          className={`material-symbols-outlined !text-[18px] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}
