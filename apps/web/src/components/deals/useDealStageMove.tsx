'use client';

/**
 * Moving a deal to a stage from the stage bar (#32). Tapping a stage asks first ("Move to
 * Proposal?") and only then moves the deal; the move is logged on the deal's activity (#31). The
 * hook returns the request function for the bar and the dialog to render.
 */
import { useState } from 'react';
import { type OpportunityStage } from '@intelliflow/domain';
import { ConfirmationDialog } from '@intelliflow/ui';
import { STAGE_LABELS } from '@/components/deals/DealStageProgress';

export interface StageMoveMutation {
  isPending: boolean;
  mutate: (
    input: { id: string; targetStage: OpportunityStage },
    options?: { onSettled?: () => void }
  ) => void;
}

export function useDealStageMove(opts: {
  dealId: string;
  dealName: string;
  stage: OpportunityStage;
  mutation: StageMoveMutation;
}) {
  const { dealId, dealName, stage, mutation } = opts;
  const [target, setTarget] = useState<OpportunityStage | null>(null);

  const dialog = (
    <ConfirmationDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
      title={target ? `Move to ${STAGE_LABELS[target]}?` : 'Move stage'}
      description={
        target
          ? `"${dealName}" will move from ${STAGE_LABELS[stage]} to ${STAGE_LABELS[target]}. The move is recorded on the deal's activity.`
          : ''
      }
      confirmLabel="Move deal"
      icon="swap_horiz"
      isLoading={mutation.isPending}
      onConfirm={() => {
        if (!target || mutation.isPending) return;
        // The dialog stays open, showing it is working, until the move settles; the bar is
        // disabled meanwhile, so a second move cannot start from a stage that is about to change.
        mutation.mutate({ id: dealId, targetStage: target }, { onSettled: () => setTarget(null) });
      }}
    />
  );

  return {
    requestMove: (next: OpportunityStage) => {
      if (!mutation.isPending) setTarget(next);
    },
    moving: mutation.isPending,
    dialog,
  };
}
