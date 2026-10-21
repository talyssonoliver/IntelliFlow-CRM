'use client';

/**
 * The message after returning from a Google / Microsoft sign-in (PG-207,
 * C-FE2). Only whitelisted query values are read, each mapped to fixed text:
 * the query is never rendered. The query is cleared straight away so a reload
 * does not repeat the message.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@intelliflow/ui';

export const EMAIL_SETTINGS_PATH = '/email/email-settings';

const CONNECTED: Record<string, string> = {
  google: 'Google mailbox connected. Email you send now leaves from it.',
  microsoft: 'Microsoft mailbox connected. Email you send now leaves from it.',
};

const ERRORS: Record<string, string> = {
  denied: 'The sign-in was cancelled, so no mailbox was connected.',
  expired: 'The sign-in took too long. Start again from Connect.',
  failed: 'The mailbox could not be connected. Try again, or set it up with SMTP.',
};

type Notice = { kind: 'status' | 'alert'; message: string };

function noticeFrom(params: URLSearchParams): Notice | null {
  const connected = params.get('connected');
  if (connected && Object.hasOwn(CONNECTED, connected)) {
    return { kind: 'status', message: CONNECTED[connected] };
  }
  const error = params.get('error');
  if (error && Object.hasOwn(ERRORS, error)) return { kind: 'alert', message: ERRORS[error] };
  return null;
}

export function OAuthReturnNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(() =>
    noticeFrom(new URLSearchParams(params.toString()))
  );
  // The query is read once, on arrival; dismissing must not re-run the clean-up.
  const arrivedWithNotice = useRef(notice !== null);

  useEffect(() => {
    if (arrivedWithNotice.current) router.replace(EMAIL_SETTINGS_PATH, { scroll: false });
  }, [router]);

  if (!notice) return null;
  const tone =
    notice.kind === 'status'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
      : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100';

  return (
    <div
      role={notice.kind}
      className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${tone}`}
    >
      <p>{notice.message}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => setNotice(null)}>
        Dismiss
      </Button>
    </div>
  );
}
