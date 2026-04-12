/**
 * ValueSummary Component (PG-135)
 *
 * Pipeline summary stats cards: Active Deals, Pipeline Value, Weighted Value, Won This Period.
 * Extracted from page.tsx lines 512-529, 649-675.
 *
 * @module ValueSummary
 * AC-7: Stats cards show accurate totals
 * AC-24: Stats cards have aria-label with full context
 */

import * as React from 'react';
import { Card } from '@intelliflow/ui';
import type { PipelineStats } from './types';
import { formatCurrencyCompact } from './types';

interface ValueSummaryProps {
  readonly stats: PipelineStats;
}

export const ValueSummary = React.memo(function ValueSummary({
  stats,
}: Readonly<ValueSummaryProps>) {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      <Card
        className="p-3 sm:p-4 bg-card border-border"
        aria-label={`Active deals: ${stats.totalDeals}`}
      >
        <p className="text-xs sm:text-sm text-muted-foreground">Active Deals</p>
        <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{stats.totalDeals}</p>
      </Card>
      <Card
        className="p-3 sm:p-4 bg-card border-border"
        aria-label={`Pipeline value: ${formatCurrencyCompact(stats.totalValue)}`}
      >
        <p className="text-xs sm:text-sm text-muted-foreground">Pipeline Value</p>
        <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
          {formatCurrencyCompact(stats.totalValue)}
        </p>
      </Card>
      <Card
        className="p-3 sm:p-4 bg-card border-border"
        aria-label={`Weighted value: ${formatCurrencyCompact(stats.weightedValue)}`}
      >
        <p className="text-xs sm:text-sm text-muted-foreground">Weighted Value</p>
        <p className="text-xl sm:text-2xl font-bold text-success mt-1">
          {formatCurrencyCompact(stats.weightedValue)}
        </p>
      </Card>
      <Card
        className="p-3 sm:p-4 bg-card border-border"
        aria-label={`Won this period: ${formatCurrencyCompact(stats.wonValue)}`}
      >
        <p className="text-xs sm:text-sm text-muted-foreground">Won This Period</p>
        <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
          {formatCurrencyCompact(stats.wonValue)}
        </p>
      </Card>
    </div>
  );
});
