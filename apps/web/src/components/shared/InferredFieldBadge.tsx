'use client';

/**
 * IFC-312 — Badge indicating a CRM field was populated by AI inference.
 * Renders only when `inferredAt` is set. Tooltip shows model version + time.
 */

import { useMemo } from 'react';

export interface InferredFieldBadgeProps {
  readonly inferredAt: Date | string | null | undefined;
  readonly modelVersion?: string | null;
  readonly label?: string;
}

export function InferredFieldBadge({
  inferredAt,
  modelVersion,
  label = 'AI-inferred',
}: Readonly<InferredFieldBadgeProps>) {
  const title = useMemo(() => {
    if (!inferredAt) return '';
    const d = typeof inferredAt === 'string' ? new Date(inferredAt) : inferredAt;
    const when = d.toLocaleString('en-US', { timeZone: 'UTC' });
    return modelVersion ? `${label} by ${modelVersion} · ${when}` : `${label} · ${when}`;
  }, [inferredAt, modelVersion, label]);

  if (!inferredAt) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
      title={title}
      aria-label={title}
      data-testid="inferred-field-badge"
    >
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
        auto_awesome
      </span>
      {label}
    </span>
  );
}
