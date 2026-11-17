'use client';

/**
 * The deal page's value and stage card (moved out of app/deals/[id]/page.tsx, MVP-003).
 *
 * A deal converted from a lead without a value stores 0, which means "not known yet", not a
 * valuation: the card offers "Add value" (opening the deal's edit form) instead of showing £0,
 * as the lead page does for its estimated value. Pipeline totals count it as 0.
 */
import { Card } from '@intelliflow/ui';
import { type OpportunityStage } from '@intelliflow/domain';

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Won',
  CLOSED_LOST: 'Lost',
};

const ACTIVE_STAGES: OpportunityStage[] = [
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function barColorFor(stage: OpportunityStage): string {
  if (stage === 'CLOSED_WON') return 'bg-green-500';
  if (stage === 'CLOSED_LOST') return 'bg-red-500';
  return 'bg-primary';
}

export function DealStageProgress({
  value,
  stage,
  probability,
  onAddValue,
}: Readonly<{
  value: number;
  stage: OpportunityStage;
  probability: number;
  /** Opens the edit form; shown as "Add value" while the value is not known yet (0). */
  onAddValue?: () => void;
}>) {
  const isClosed = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST';
  const stageIndex = isClosed ? ACTIVE_STAGES.length - 1 : ACTIVE_STAGES.indexOf(stage);
  const progressWidth = isClosed ? 100 : ((stageIndex + 1) / ACTIVE_STAGES.length) * 100;

  return (
    <Card className="p-6">
      <div className="flex justify-between items-end mb-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Total Value</p>
          {value > 0 || !onAddValue ? (
            <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(value)}
            </p>
          ) : (
            <button
              type="button"
              onClick={onAddValue}
              className="mt-1 text-xl font-semibold text-[#2a78f6] hover:underline"
            >
              Add value
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {STAGE_LABELS[stage]}
          </p>
          <p className="text-xs text-slate-500">
            {isClosed
              ? `${STAGE_LABELS[stage]}`
              : `Stage ${stageIndex + 1} of ${ACTIVE_STAGES.length}`}{' '}
            &bull; {probability}% Probability
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full ${barColorFor(stage)} rounded-full transition-all duration-300`}
          style={{ width: `${progressWidth}%` }}
        />
        {/* Stage dividers */}
        <div className="absolute top-0 left-0 w-full h-full flex justify-between px-[10%]">
          {ACTIVE_STAGES.slice(0, -1).map((s) => (
            <div
              key={`divider-${s}`}
              className="w-0.5 h-full bg-white dark:bg-slate-900 opacity-50"
            />
          ))}
        </div>
      </div>

      {/* Stage Labels */}
      <div className="flex justify-between mt-2 text-xs font-medium text-slate-500 px-1">
        {ACTIVE_STAGES.map((s, index) => (
          <span key={s} className={index <= stageIndex || isClosed ? 'text-primary' : ''}>
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
    </Card>
  );
}
