'use client';

/**
 * ForecastHeader (PG-131)
 *
 * Header component for forecast pages in both portfolio and deal modes.
 * AC-008: Renders appropriate breadcrumbs, title, and actions for both modes.
 */

import { EntityHeader } from '@/components/shared';
import { PIPELINE_STAGE_CONFIG, type ForecastMode, type OpportunityStage } from './types';

export interface ForecastHeaderProps {
  mode: ForecastMode;
  dealName?: string;
  dealId?: string;
  dealStage?: OpportunityStage;
  quarter: string;
  liveCount?: number;
  winRate?: number;
  onExport?: () => void;
}

export function ForecastHeader({
  mode,
  dealName,
  dealId,
  dealStage,
  quarter,
  liveCount,
  winRate,
  onExport,
}: Readonly<ForecastHeaderProps>) {
  const breadcrumbs =
    mode === 'portfolio'
      ? [{ label: 'Deals', href: '/deals' }, { label: 'Forecast' }]
      : [
          { label: 'Deals', href: '/deals' },
          { label: dealName ?? 'Deal', href: dealId ? `/deals/${dealId}` : '/deals' },
          { label: 'Forecast' },
        ];

  const title = mode === 'portfolio' ? 'Deal Forecast' : `${dealName ?? 'Deal'} Forecast`;

  let badges: { label: string; variant: 'info' | 'status' }[];
  if (mode === 'portfolio') {
    badges = [{ label: quarter, variant: 'info' as const }];
  } else if (dealStage) {
    badges = [{ label: PIPELINE_STAGE_CONFIG[dealStage]?.label ?? dealStage, variant: 'status' as const }];
  } else {
    badges = [];
  }

  const actions = onExport ? [{ label: 'Export', onClick: onExport }] : [];

  return (
    <div data-testid="forecast-header">
      <EntityHeader title={title} breadcrumbs={breadcrumbs} badges={badges} actions={actions} />
      {mode === 'portfolio' && (
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          {liveCount !== undefined && (
            <span data-testid="live-count">{liveCount} active opportunities</span>
          )}
          {winRate !== undefined && <span data-testid="win-rate">Win rate: {winRate}%</span>}
        </div>
      )}
    </div>
  );
}
