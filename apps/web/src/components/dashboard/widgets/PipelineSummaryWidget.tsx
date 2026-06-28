'use client';

import { trpc } from '@/lib/trpc';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  computePipelineStagePercent,
  formatGBP,
} from '@/lib/dashboard/kpi-calculator';
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
  const { data, isLoading } = trpc.opportunity.getPipeline.useQuery(
    { includeClosedStages: false },
    { refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Pipeline Summary</h3>
        <button
          type="button"
          aria-label="Pipeline options"
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            more_horiz
          </span>
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
                <div className="w-full h-2 bg-muted rounded-full" />
              </div>
            ))
          : data?.stages.map((stage) => {
              const percentage = computePipelineStagePercent(
                stage.totalValue,
                data.totalPipelineValue
              );
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
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
