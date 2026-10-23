'use client';

/**
 * Shared pieces of the public data request pages (PG-203 DSAR, spec Addendum A).
 *
 * Links in DSAR emails carry `#r=<requestId>.<token>` in the URL fragment, which browsers
 * never send to a server. `takeDsarFragment` reads it once and removes it from the address
 * bar and history straight away, so it cannot leak through a later navigation, a bookmark or
 * an error report. Imports stay light (types only) so no server code enters the bundle.
 */
import type { DsarSubmitInput } from '@intelliflow/validators/dsar';

export type DsarRequestType = DsarSubmitInput['type'];

export interface DsarLink {
  requestId: string;
  token: string;
}

const FRAGMENT = /^#r=([A-Za-z0-9-]{10,40})\.([A-Za-z0-9_-]{43})$/;

/** Parse `#r=<id>.<token>`; anything else is not a DSAR link. */
export function parseDsarFragment(hash: string): DsarLink | null {
  const match = FRAGMENT.exec(hash);
  return match ? { requestId: match[1]!, token: match[2]! } : null;
}

/** Read the link from the current URL once, then strip the fragment from it. */
export function takeDsarFragment(win: Window = window): DsarLink | null {
  const link = parseDsarFragment(win.location.hash);
  if (win.location.hash) {
    win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
  }
  return link;
}

/** What each request type asks for, in the person's words. */
export const DSAR_TYPE_COPY: Record<DsarRequestType, { label: string; detail: string }> = {
  ACCESS: {
    label: 'Get a copy of my data',
    detail: 'The personal data the firm holds about you, and how it uses it.',
  },
  PORTABILITY: {
    label: 'Get my data to take elsewhere',
    detail: 'The data you gave the firm, in a machine-readable file.',
  },
  RECTIFICATION: {
    label: 'Correct my data',
    detail: 'Fix personal data that is wrong or incomplete.',
  },
  ERASURE: {
    label: 'Delete my data',
    detail: 'The firm deletes your data unless the law requires it to keep it.',
  },
  RESTRICTION: {
    label: 'Pause the use of my data',
    detail: 'The firm keeps your data but stops using it while a question is settled.',
  },
  OBJECTION: {
    label: 'Object to the use of my data',
    detail: 'For example, stop marketing to me.',
  },
};

export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

/** "22 November 2026" for an ISO instant (the deadline is a calendar date). */
export function dueDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function DsarPage({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">{children}</main>;
}

export function DsarNotice({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <DsarPage>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <div className="mt-3 space-y-2 text-muted-foreground">{children}</div>
    </DsarPage>
  );
}

export function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}
