'use client';

/**
 * ForecastHistory (PG-131)
 *
 * Chart showing probability over time (deal) or win rate trend (portfolio).
 * AC-006: 30-day step chart in deal mode, win rate trend in portfolio mode.
 * NF-003: Uses dynamic import with ssr: false.
 */

import dynamic from 'next/dynamic';
import { Card, Skeleton } from '@intelliflow/ui';
import type { HistoryPoint, ForecastMode } from './types';

export interface ForecastHistoryProps {
  data: HistoryPoint[];
  mode: ForecastMode;
  isLoading?: boolean;
  emptyMessage?: string;
}

const ForecastHistoryChart = dynamic(() => import('./ForecastHistoryChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export function ForecastHistory({
  data,
  mode,
  isLoading,
  emptyMessage = 'No history data available yet',
}: Readonly<ForecastHistoryProps>) {
  if (isLoading) {
    return (
      <Card className="p-4" data-testid="forecast-history">
        <h3 className="text-sm font-semibold mb-3">
          {mode === 'portfolio' ? 'Win Rate Trend' : 'Probability History'}
        </h3>
        <Skeleton className="h-64 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-4" data-testid="forecast-history">
      <h3 className="text-sm font-semibold mb-3">
        {mode === 'portfolio' ? 'Win Rate Trend' : 'Probability History'}
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12" data-testid="empty-state">
          {emptyMessage}
        </p>
      ) : (
        <ForecastHistoryChart data={data} mode={mode} />
      )}
    </Card>
  );
}
