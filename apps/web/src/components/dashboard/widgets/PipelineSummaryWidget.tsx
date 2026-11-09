'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  computePipelineStagePercent,
  formatGBP,
} from '@/lib/dashboard/kpi-calculator';
import { ChartUnavailable } from '@/components/shared/ChartEmptyState';
import type { WidgetProps } from './index';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-stage-qualification',
  PROPOSAL: 'bg-stage-proposal',
  NEGOTIATION: 'bg-stage-negotiation',
  CLOSED_WON: 'bg-stage-won',
  DISCOVERY: 'bg-blue-400',
  DEMO: 'bg-indigo-400',
};

export function PipelineSummaryWidget(_props: Readonly<WidgetProps>) {
  const {
    data,
    isLoading,
    isError: requestFailed,
    refetch,
  } = trpc.opportunity.getPipeline.useQuery(
    { includeClosedStages: false },
    { refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );
  // A failed background refresh keeps the figures already loaded (React Query keeps
  // `data`); "Couldn't load" is only for a request that never produced any.
  const isError = requestFailed && !data;

  // Denominator = sum of the DISPLAYED (open) stages, not the API's
  // `totalPipelineValue` which includes closed-won/lost. Using the API total
  // here would understate every open-stage share.
  const displayedTotal = (data?.stages ?? []).reduce((sum, s) => sum + Number(s.totalValue), 0);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h3 className="text-lg font-semibold text-foreground">Pipeline Summary</h3>
        {/* #1225 UI-012: was an options button with no handler; it now opens the board. */}
        <Link
          href="/deals?view=pipeline"
          aria-label="Open the pipeline board"
          title="Open the pipeline board"
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            open_in_new
          </span>
        </Link>
      </div>

      <div className="space-y-4 flex-1">
        {isError && (
          <ChartUnavailable message="Couldn't load the pipeline." onRetry={() => void refetch()} />
        )}
        {!isError && isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
                <div className="w-full h-2 bg-muted rounded-full" />
              </div>
            ))
          : !isError &&
            data?.stages.map((stage) => {
              const percentage = computePipelineStagePercent(stage.totalValue, displayedTotal);
              return (
                <div key={stage.stageKey}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{stage.displayName}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatGBP(stage.totalValue)} ({stage.count} Deals)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${STAGE_COLORS[stage.stageKey] || 'bg-primary'} rounded-full motion-safe:transition-all`}
                      // Floor only non-zero shares so truly-empty stages show no
                      // bar (avoids a phantom 2% sliver for a GBP0 stage).
                      style={{
                        width: percentage > 0 ? `${Math.min(Math.max(percentage, 2), 100)}%` : '0%',
                      }}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
