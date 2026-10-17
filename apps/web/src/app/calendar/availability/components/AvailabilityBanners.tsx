'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@intelliflow/ui';
import type { DraftError } from '../availability-draft';

export const READ_ONLY_NOTE_ID = 'availability-read-only-note';

const UNCONFIGURED_NOTE =
  'Availability has not been saved yet. Until you save, the built-in booking rule applies (07:00-19:00 any day). Saving switches this firm to the availability set here.';

const ALERT_BOX =
  'mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/40';

/** The notes above the cards: read-only, never saved, and unsaved edits. */
export function PageNotes({
  readOnly,
  isConfigured,
  isDirty,
}: Readonly<{ readOnly: boolean; isConfigured: boolean; isDirty: boolean }>) {
  return (
    <>
      {readOnly && (
        <p id={READ_ONLY_NOTE_ID} className="mb-4 text-sm text-muted-foreground">
          You can view availability but only admins and managers can change it.
        </p>
      )}
      {!isConfigured && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
          {UNCONFIGURED_NOTE}
        </p>
      )}
      {!readOnly && isDirty && (
        <p className="mb-4 text-sm font-medium text-foreground">Unsaved changes</p>
      )}
    </>
  );
}

/** Validation summary shown after Save is clicked; each link moves focus to its field. */
export function ErrorSummary({ errors }: Readonly<{ errors: DraftError[] }>) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className={ALERT_BOX}>
      <p className="font-medium text-red-700 dark:text-red-300">
        {errors.length === 1 ? '1 problem needs fixing' : `${errors.length} problems need fixing`}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              className="text-red-700 underline dark:text-red-300"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(error.fieldId)?.focus();
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ServerError {
  message: string;
  conflict: boolean;
}

/** A failed save or reset, focused when it appears; a CONFLICT offers Reload. */
export function ServerErrorBanner({
  error,
  onReload,
}: Readonly<{ error: ServerError | null; onReload: () => void }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  if (!error) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`${ALERT_BOX} flex flex-wrap items-center justify-between gap-3`}
    >
      <p className="text-red-700 dark:text-red-300">{error.message}</p>
      {error.conflict && (
        <Button type="button" variant="outline" size="sm" onClick={onReload}>
          Reload
        </Button>
      )}
    </div>
  );
}
