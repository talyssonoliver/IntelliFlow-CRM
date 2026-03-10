'use client';

/**
 * Shared Billing Components
 *
 * Extracted from billing-portal.tsx for reuse across all billing components.
 *
 * @implements PG-172 (Billing Ghost Pages)
 */

import { Card, CardHeader, CardContent, Skeleton } from '@intelliflow/ui';

/** Standard empty state following design system: 24px icon, sm text, centered. */
export function EmptyState({ icon, message }: Readonly<{ icon: string; message: string }>) {
  return (
    <div className="text-center py-6">
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <span
          className="material-symbols-outlined text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
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
