/**
 * Ticket Config Shared Utilities - PG-173
 *
 * Config-specific empty states, loading skeletons, and time formatting.
 */

'use client';

import { Button, Card, CardContent, Skeleton, EmptyState } from '@intelliflow/ui';

interface ConfigEmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export function ConfigEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: ConfigEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <EmptyState entity="rules" phase="passive" title={title} description={description} />
        <Button onClick={onAction}>{actionLabel}</Button>
      </CardContent>
    </Card>
  );
}

export function ConfigCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Format minutes to human-readable display.
 * Examples: 15 → "15m", 60 → "1h", 240 → "4h", 1440 → "24h", 4320 → "72h"
 */
export function formatMinutesToDisplay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}
