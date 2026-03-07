'use client';

/**
 * RiskFactorsCard (PG-131)
 *
 * Displays severity-coded risk factors for a deal.
 * AC-004: Severity badges, descriptions, empty/loading states.
 */

import { Card, Skeleton } from '@intelliflow/ui';
import type { RiskFactor } from './types';

export interface RiskFactorsCardProps {
  factors: RiskFactor[];
  isLoading?: boolean;
  emptyMessage?: string;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const SEVERITY_STYLES: Record<string, { badge: string; icon: string }> = {
  high: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '⚠' },
  medium: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: '●',
  },
  low: {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: '○',
  },
};

export function RiskFactorsCard({
  factors,
  isLoading,
  emptyMessage = 'No risk factors identified',
}: Readonly<RiskFactorsCardProps>) {
  if (isLoading) {
    return (
      <Card className="p-4" data-testid="risk-factors-card">
        <h3 className="text-sm font-semibold mb-3">Risk Factors</h3>
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    );
  }

  const sorted = [...factors].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );

  return (
    <Card className="p-4" data-testid="risk-factors-card">
      <h3 className="text-sm font-semibold mb-3">Risk Factors</h3>
      {sorted.length === 0 ? (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="empty-state"
        >
          <span className="text-green-500">✓</span>
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="risk-factors-list">
          {sorted.map((factor) => {
            const style = SEVERITY_STYLES[factor.severity] ?? SEVERITY_STYLES.low;
            return (
              <li key={factor.id} className="flex items-start gap-3" data-testid="risk-factor-item">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}
                  data-testid="severity-badge"
                >
                  {style.icon} {factor.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{factor.factor}</p>
                  <p className="text-xs text-muted-foreground">{factor.description}</p>
                  <p className="text-xs text-muted-foreground italic">{factor.impact}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
