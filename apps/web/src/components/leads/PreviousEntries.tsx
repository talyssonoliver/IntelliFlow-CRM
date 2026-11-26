'use client';

import { useEffect, useState } from 'react';

/**
 * "See previous (n)" under the newest of a repeated entry (owner 21/11 on the lead page): the
 * earlier copies stay one tap away instead of filling the list. Opens by itself when a link points
 * at one of them.
 */
export function PreviousEntries({
  count,
  defaultOpen = false,
  forceOpen = false,
  children,
}: Readonly<{
  count: number;
  defaultOpen?: boolean;
  /**
   * Opens the fold when it turns true, e.g. when "Open" on the Emails tab points at an entry
   * inside it (codex review 26/11: the timeline could not scroll to a folded email).
   */
  forceOpen?: boolean;
  children: React.ReactNode;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  if (count === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-ds-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={`material-symbols-outlined !text-[18px] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
        {open ? 'Hide previous' : `See previous (${count})`}
      </button>
      {open && <div className="mt-2 space-y-4">{children}</div>}
    </div>
  );
}
