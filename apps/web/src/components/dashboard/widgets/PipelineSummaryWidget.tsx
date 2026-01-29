'use client';

import type { WidgetProps } from './index';

interface PipelineStage {
  name: string;
  value: string;
  deals: number;
  percentage: number;
  color: string;
}

const stages: PipelineStage[] = [
  { name: 'Qualification', value: '$12,400', deals: 8, percentage: 15, color: 'bg-stage-qualification' },
  { name: 'Proposal', value: '$34,200', deals: 12, percentage: 40, color: 'bg-stage-proposal' },
  { name: 'Negotiation', value: '$120,000', deals: 4, percentage: 25, color: 'bg-stage-negotiation' },
  { name: 'Closed Won', value: '$40,000', deals: 2, percentage: 20, color: 'bg-stage-won' },
];

export function PipelineSummaryWidget(_props: WidgetProps) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">
          Pipeline Summary
        </h3>
        <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {stages.map((stage) => (
          <div key={stage.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                {stage.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {stage.value} ({stage.deals} Deals)
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${stage.color} rounded-full transition-all`}
                style={{ width: `${stage.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
