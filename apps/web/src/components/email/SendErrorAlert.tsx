'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { EmailSendErrorView } from './send-errors';

/**
 * A coded send refusal (PG-207, AC-EM-018). It takes focus when it appears so
 * it is announced and acted on (CA-8).
 */
export function SendErrorAlert({
  error,
  className,
}: Readonly<{ error: EmailSendErrorView; className?: string }>) {
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
        <Link href={error.action.href} className="font-medium underline underline-offset-4">
          {error.action.label}
        </Link>
      ) : null}
    </div>
  );
}
