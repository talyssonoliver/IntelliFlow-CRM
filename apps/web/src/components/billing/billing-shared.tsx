'use client';

/**
 * Shared Billing Components
 *
 * Extracted from billing-portal.tsx for reuse across all billing components.
 *
 * @implements PG-172 (Billing Ghost Pages)
 */

import {
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  EmptyState as SharedEmptyState,
  type EmptyStateEntity,
} from '@intelliflow/ui';

/** Standard empty state following design system — delegates to shared EmptyState. */
export function EmptyState({
  icon: _icon,
  message,
  entity = 'invoices',
}: Readonly<{ icon: string; message?: string; entity?: EmptyStateEntity }>) {
  return <SharedEmptyState entity={entity} phase="passive" description={message} />;
}

/** Standard error state following design system alert pattern. */
export function ErrorState({ message }: Readonly<{ message: string }>) {
  return (
    <div
      className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
      role="alert"
      aria-live="polite"
    >
      <span className="material-symbols-outlined text-red-600 dark:text-red-400" aria-hidden="true">
        error
      </span>
      <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
    </div>
  );
}

/** Standard loading skeleton for card sections. */
export function CardSkeleton({ rows = 2 }: Readonly<{ rows?: number }>) {
  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-4">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
