'use client';

import { trpc } from '@/lib/trpc';
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
  const { data, isLoading } = trpc.opportunity.getPipeline.useQuery({
    includeClosedStages: false,
  });

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Pipeline Summary</h3>
        <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <span className="material-symbols-outlined">more_horiz</span>
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
              const total = Number(data.totalPipelineValue) || 1;
              const stageValue = Number(stage.totalValue);
              const percentage = total > 0 ? Math.round((stageValue / total) * 100) : 0;
              return (
                <div key={stage.stageKey}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      {stage.displayName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {stageValue.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      })}{' '}
                      ({stage.count} Deals)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${STAGE_COLORS[stage.stageKey] || 'bg-primary'} rounded-full transition-all`}
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
