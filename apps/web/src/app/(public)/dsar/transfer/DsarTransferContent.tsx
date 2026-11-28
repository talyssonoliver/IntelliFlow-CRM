'use client';

/**
 * Download page for personal data sent to another controller (IFC-317, UK GDPR Art 20(2)).
 *
 * The person asked a firm to send their data to the organisation reading this. The emailed link
 * is /dsar/transfer#t=<token>: the token is in the fragment, which browsers never send to a
 * server, and is read once and stripped. The link works once, so the page never fetches on load
 * (a mail scanner or a link preview would use it up): the data is requested only when the
 * visitor presses the button. It then stays in memory, to be saved as JSON or as CSV files in a
 * zip, and is never written to browser storage.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@intelliflow/ui';
import type { DsarExportDto } from '@intelliflow/validators/dsar';
import { trpc } from '@/lib/trpc';
import { saveExportCsv } from '@/lib/dsar/export-csv';
import {
  DsarNotice,
  DsarPage,
  errorCode,
  takeTransferFragment,
  useFocusHeading,
} from '../dsar-shared';
import { Summary, saveExport } from '../[handle]/export/DsarExportContent';

/** What to tell the visitor when the download fails: one answer for every dead link. */
export function transferErrorMessage(error: unknown): string {
  if (errorCode(error) === 'TOO_MANY_REQUESTS') {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (errorCode(error) === 'NOT_FOUND') {
    return 'This link is not available. Ask the organisation that sent it to send a new one.';
  }
  // A server or network failure does not use the link up: it may still work.
  return 'Something went wrong on our side. Wait a moment and press the button again.';
}

export default function DsarTransferContent() {
  const download = trpc.privacy.downloadTransfer.useMutation();
  // Read once into the ref (StrictMode's second effect run must not re-read a stripped URL).
  const taken = useRef<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<DsarExportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useFocusHeading(data !== null);

  useEffect(() => {
    if (taken.current === undefined) taken.current = takeTransferFragment();
    setToken(taken.current);
  }, []);

  if (token === undefined) {
    return (
      <DsarNotice title="Personal data sent to you">
        <output>Please wait</output>
      </DsarNotice>
    );
  }
  if (!token) {
    return (
      <DsarNotice title="This link is incomplete" focusOnShow>
        <p>Open the link from the email again, in full.</p>
      </DsarNotice>
    );
  }

  const fetchData = async (current: string) => {
    setError(null);
    try {
      setData(await download.mutateAsync({ token: current }));
    } catch (failure) {
      setError(transferErrorMessage(failure));
    }
  };

  return (
    <DsarPage>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold text-foreground focus:outline-none"
      >
        Personal data sent to you
      </h1>
      {data ? (
        <>
          <p className="mt-3 text-foreground">
            {`From ${data.processingInformation.controller.name}, prepared ${new Date(
              data.generatedAt
            ).toLocaleString(
              'en-GB'
            )}. The link is now used up: save the file before you leave this page, because it cannot be opened again.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveExport(data)}>
              Save as a file
            </Button>
            <Button type="button" variant="outline" onClick={() => saveExportCsv(data)}>
              Save as spreadsheets (CSV)
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This file holds personal data. Once you hold it you are responsible for it as a
            controller.
          </p>
          <Summary data={data} />
        </>
      ) : (
        <>
          <p className="mt-3 text-foreground">
            A person asked an organisation to send you their personal data (UK GDPR Article 20(2)).
          </p>
          <p className="mt-2 text-muted-foreground">
            The link works once. Pressing the button below uses it up, so be ready to save the file.
            The data is shown here and is not stored by your browser.
          </p>
          <Button
            type="button"
            className="mt-4"
            aria-disabled={download.isPending || undefined}
            onClick={() => {
              if (download.isPending) return;
              fetchData(token).catch(() => setError(transferErrorMessage(null)));
            }}
          >
            {download.isPending ? 'Preparing…' : 'Get the data'}
          </Button>
        </>
      )}
      <output className="mt-4 block text-sm text-red-700 dark:text-red-300">{error}</output>
    </DsarPage>
  );
}
