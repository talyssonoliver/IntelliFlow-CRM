import type { ReactNode } from 'react';
import Link from 'next/link';

/** Read-only summary of a setting that moved to the Availability page (PG-202, owner Q2), with a link there. */
export function AvailabilityPointer({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
      {children && <p className="mb-1 text-slate-700 dark:text-slate-200">{children}</p>}
      <Link href="/calendar/availability" className="text-primary underline underline-offset-2">
        Manage working hours, buffers and timezone in Availability
      </Link>
    </div>
  );
}
