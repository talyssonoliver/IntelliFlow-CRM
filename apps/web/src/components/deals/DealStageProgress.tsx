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
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';
import { formatMoney } from '@/lib/format/money';

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

export function formatCurrency(value: number, currency = 'GBP'): string {
  return formatMoney(value, currency);
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
  onSelectStage,
  allowedStages,
  moving = false,
}: Readonly<{
  value: number;
  stage: OpportunityStage;
  probability: number;
  /** Opens the edit form; shown as "Add value" while the value is not known yet (0). */
  onAddValue?: () => void;
  /**
   * Makes the stage labels buttons that ask to move the deal to that stage (the page confirms
   * first). Not passed for a closed deal, whose labels stay plain text.
   */
  onSelectStage?: (stage: OpportunityStage) => void;
  /** The stages the deal may move to from here (the API accepts only these); the rest are disabled. */
  allowedStages?: readonly OpportunityStage[];
  /** A move is in flight: no stage can be started until it settles. */
  moving?: boolean;
}>) {
  const currency = useTenantCurrency();
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
              {formatCurrency(value, currency)}
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
      {/* Stage labels: buttons when the deal can be moved. They wrap on a phone, each a full tap target. */}
      <fieldset
        aria-label={onSelectStage ? 'Move this deal to a stage' : undefined}
        className="m-0 mt-3 flex min-w-0 flex-wrap gap-2 border-0 p-0 text-xs font-medium sm:mt-2 sm:flex-nowrap sm:justify-between sm:gap-1"
      >
        {ACTIVE_STAGES.map((s, index) => {
          const reached = index <= stageIndex || isClosed;
          const tone = reached ? 'text-primary' : 'text-slate-500';
          if (!onSelectStage) {
            return (
              <span key={s} className={tone}>
                {STAGE_LABELS[s]}
              </span>
            );
          }
          const current = s === stage;
          // A deal moves one step at a time: a stage the API would refuse is shown but not offered.
          const allowed = !allowedStages || allowedStages.includes(s);
          return (
            <button
              key={s}
              type="button"
              disabled={current || moving || !allowed}
              aria-current={current ? 'step' : undefined}
              title={!current && !allowed ? 'A deal moves one stage at a time' : undefined}
              onClick={() => onSelectStage(s)}
              className={`min-h-11 rounded-lg border px-3 transition-colors disabled:cursor-not-allowed sm:px-2 ${tone} ${
                current
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          );
        })}
      </fieldset>
    </Card>
  );
}

/** The toast after a stage move: Won and Lost keep their wording, any other stage is named. */
export function stageMoveToastTitle(target: OpportunityStage): string {
  if (target === 'CLOSED_WON') return 'Deal marked as Won';
  if (target === 'CLOSED_LOST') return 'Deal marked as Lost';
  return `Moved to ${STAGE_LABELS[target]}`;
}
