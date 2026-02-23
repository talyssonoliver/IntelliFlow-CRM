'use client';

/**
 * RecommendedActions (PG-131)
 *
 * Action cards with priority indicators for deal recommendations.
 * AC-005: Priority-ordered cards with click handlers.
 */

import { Card, Skeleton } from '@intelliflow/ui';
import type { Recommendation } from './types';

export interface RecommendedActionsProps {
  recommendations: Recommendation[];
  isLoading?: boolean;
  emptyMessage?: string;
  onActionClick?: (recommendation: Recommendation) => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export function RecommendedActions({
  recommendations,
  isLoading,
  emptyMessage = 'No actions recommended',
  onActionClick,
}: RecommendedActionsProps) {
  if (isLoading) {
    return (
      <Card className="p-4" data-testid="recommended-actions">
        <h3 className="text-sm font-semibold mb-3">Recommended Actions</h3>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  const sorted = [...recommendations].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  return (
    <Card className="p-4" data-testid="recommended-actions">
      <h3 className="text-sm font-semibold mb-3">Recommended Actions</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="empty-state">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="actions-list">
          {sorted.map((rec) => (
            <li key={rec.id}>
              <button
                type="button"
                className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => onActionClick?.(rec)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActionClick?.(rec);
                  }
                }}
                data-testid="action-card"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[rec.priority] ?? ''}`}
                    data-testid="priority-badge"
                  >
                    {rec.priority}
                  </span>
                  <span className="text-sm font-medium">{rec.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{rec.description}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
