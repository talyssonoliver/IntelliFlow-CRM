'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { EmailSendPurpose } from '@intelliflow/domain';
import type { EmailSendErrorView } from './send-errors';

const PURPOSE_BUTTON =
  'rounded-md border border-red-300 px-2 py-1 font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-ring dark:border-red-700 dark:hover:bg-red-900/40';

/**
 * A coded send refusal (PG-207, AC-EM-018). It takes focus when it appears so
 * it is announced and acted on (CA-8).
 */
export function SendErrorAlert({
  error,
  className,
  onAction,
  onChoosePurpose,
}: Readonly<{
  error: EmailSendErrorView;
  className?: string;
  /** Replaces following the link, for a page with something to save first. */
  onAction?: (href: string) => void;
  /** IFC-315: resend with an explicit purpose after a PURPOSE_REQUIRED refusal. */
  onChoosePurpose?: (purpose: EmailSendPurpose) => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [error]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900 focus:outline-none focus:ring-2 focus:ring-ring dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
        className
      )}
    >
      <p className="font-medium">{error.title}</p>
      <p>{error.message}</p>
      {error.action ? (
        <Link
          href={error.action.href}
          className="font-medium underline underline-offset-4"
          onClick={(event) => {
            if (!onAction || !error.action) return;
            event.preventDefault();
            onAction(error.action.href);
          }}
        >
          {error.action.label}
        </Link>
      ) : null}
      {error.code === 'PURPOSE_REQUIRED' && onChoosePurpose ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={PURPOSE_BUTTON}
            onClick={() => onChoosePurpose('SERVICE')}
          >
            Send as a service email
          </button>
          <button
            type="button"
            className={PURPOSE_BUTTON}
            onClick={() => onChoosePurpose('MARKETING')}
          >
            Send as marketing
          </button>
        </div>
      ) : null}
    </div>
  );
}
