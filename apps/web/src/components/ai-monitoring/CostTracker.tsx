'use client';

/**
 * CostTracker — AI operation cost and ROI summary (PG-146)
 */

import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton, cn } from '@intelliflow/ui';
import type { ROIData } from '@/lib/ai-monitoring/types';

interface CostTrackerProps {
  roi: ROIData | null;
  isLoading: boolean;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTrendIcon(direction: string): string {
  switch (direction) {
    case 'up':
      return 'trending_up';
    case 'down':
      return 'trending_down';
    default:
      return 'trending_flat';
  }
}

export function CostTracker({ roi, isLoading }: Readonly<CostTrackerProps>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            payments
          </span>{' '}
          Cost & ROI
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {(() => {
          if (isLoading) return (
          <div className="space-y-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
          );
          if (roi === null) return (
          <div data-testid="no-cost-data">
            <EmptyState entity="insights" phase="passive" className="py-4" />
          </div>
          );
          return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ROI</span>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    'text-xl font-bold',
                    roi.roi >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                  data-testid="roi-value"
                >
                  {roi.roi >= 0 ? '+' : ''}
                  {roi.roi.toFixed(1)}%
                </span>
                <span
                  className={cn(
                    'material-symbols-outlined text-lg',
                    roi.roi >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                  aria-hidden="true"
                  data-testid="trend-icon"
                >
                  {getTrendIcon(roi.trendDirection)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Total Cost</p>
                <p className="font-medium" data-testid="total-cost">
                  {formatCurrency(roi.totalCost)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Value</p>
                <p className="font-medium" data-testid="total-value">
                  {formatCurrency(roi.totalValue)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net Value</p>
              <p
                className={cn(
                  'text-sm font-medium',
                  roi.netValue >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
                data-testid="net-value"
              >
                {formatCurrency(roi.netValue)}
              </p>
            </div>
          </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
