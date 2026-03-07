/**
 * PipelineBoard Component (PG-135)
 *
 * Kanban board with DnD context, stage transition validation, and accessible announcements.
 * Extracted from page.tsx lines 461-593, 737-771.
 *
 * @module PipelineBoard
 * AC-1: 7 stage columns render
 * AC-3: DnD moves deals between stages with optimistic update
 * AC-4: Invalid stage transitions are rejected
 * AC-6: CLOSED_WON only from NEGOTIATION
 * AC-19: @dnd-kit announcer provides screen reader feedback
 * AC-21: Kanban board uses role="region" with aria-label
 * AC-31: Uses React.memo for performance
 * AC-32: OPPORTUNITY_STAGES from domain as single source of truth
 */

import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Deal, OpportunityStage } from './types';
import { OPPORTUNITY_STAGES, PIPELINE_STAGE_CONFIG, formatCurrencyCompact } from './types';
import { StageColumn } from './StageColumn';

interface PipelineBoardProps {
  readonly deals: Deal[];
  readonly onStageChange: (dealId: string, newStage: OpportunityStage) => void;
  readonly onDealNavigate: (dealId: string) => void;
  readonly pendingDealId?: string | null;
}

// Mirrors OpportunityService.STAGE_TRANSITION_RULES (packages/application)
const STAGE_TRANSITION_RULES: Record<OpportunityStage, OpportunityStage[]> = {
  PROSPECTING: ['QUALIFICATION', 'CLOSED_LOST'],
  QUALIFICATION: ['NEEDS_ANALYSIS', 'PROSPECTING', 'CLOSED_LOST'],
  NEEDS_ANALYSIS: ['PROPOSAL', 'QUALIFICATION', 'CLOSED_LOST'],
  PROPOSAL: ['NEGOTIATION', 'NEEDS_ANALYSIS', 'CLOSED_LOST'],
  NEGOTIATION: ['CLOSED_WON', 'CLOSED_LOST', 'PROPOSAL'],
  CLOSED_WON: [],
  CLOSED_LOST: ['PROSPECTING'],
};

function isValidTransition(from: OpportunityStage, to: OpportunityStage): boolean {
  return STAGE_TRANSITION_RULES[from]?.includes(to) ?? false;
}

export const PipelineBoard = React.memo(function PipelineBoard({
  deals,
  onStageChange,
  onDealNavigate,
  pendingDealId,
}: Readonly<PipelineBoardProps>) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group deals by stage (AC-32: uses OPPORTUNITY_STAGES from domain)
  const dealsByStage = useMemo(() => {
    const grouped = Object.fromEntries(OPPORTUNITY_STAGES.map((s) => [s, [] as Deal[]])) as Record<
      OpportunityStage,
      Deal[]
    >;

    for (const deal of deals) {
      if (grouped[deal.stage]) {
        grouped[deal.stage].push(deal);
      }
    }
    return grouped;
  }, [deals]);

  // Get deal name for announcements
  const getDealName = useCallback(
    (id: string | number) => {
      const deal = deals.find((d) => d.id === String(id));
      return deal?.name ?? 'Unknown deal';
    },
    [deals]
  );

  // Get stage label for announcements
  const getStageLabel = useCallback((id: string | number) => {
    const stage = String(id) as OpportunityStage;
    return PIPELINE_STAGE_CONFIG[stage]?.label ?? String(id);
  }, []);

  const handleDragStart = useCallback(
    (event: Readonly<DragStartEvent>) => {
      const deal = deals.find((d) => d.id === String(event.active.id));
      if (deal) setActiveDeal(deal);
    },
    [deals]
  );

  const handleDragEnd = useCallback(
    (event: Readonly<DragEndEvent>) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId === overId) return;

      const draggedDeal = deals.find((d) => d.id === activeId);
      if (!draggedDeal) return;

      // Determine target stage: either directly a stage ID, or the stage of the deal being dropped on
      let targetStage: OpportunityStage | undefined = OPPORTUNITY_STAGES.find((s) => s === overId);

      if (!targetStage) {
        const overDeal = deals.find((d) => d.id === overId);
        if (overDeal && overDeal.stage !== draggedDeal.stage) {
          targetStage = overDeal.stage;
        }
      }

      if (!targetStage || targetStage === draggedDeal.stage) return;

      // Validate transition (AC-4, AC-6)
      if (!isValidTransition(draggedDeal.stage, targetStage)) return;

      onStageChange(activeId, targetStage);
    },
    [deals, onStageChange]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDeal(null);
  }, []);

  return (
    <section aria-label="Deal pipeline kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up deal: ${getDealName(active.id)}`,
            onDragOver: ({ active, over }) =>
              over
                ? `Deal ${getDealName(active.id)} is over ${getStageLabel(over.id)}`
                : `Deal ${getDealName(active.id)} is not over a stage`,
            onDragEnd: ({ active, over }) =>
              over
                ? `Moved deal ${getDealName(active.id)} to ${getStageLabel(over.id)}`
                : `Deal ${getDealName(active.id)} was dropped`,
            onDragCancel: () => 'Drag cancelled',
          },
          screenReaderInstructions: {
            draggable:
              'Press Space to pick up. Use arrow keys to move between stages. Press Space to drop, Escape to cancel.',
          },
        }}
      >
        <div className="flex gap-3 sm:gap-4 min-w-max">
          {OPPORTUNITY_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              deals={dealsByStage[stage]}
              onDealNavigate={onDealNavigate}
              pendingDealId={pendingDealId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && (
            <div className="bg-card rounded-lg border-2 border-primary shadow-xl p-3 sm:p-4 w-[220px] sm:w-[280px] opacity-90">
              <h4 className="font-medium text-foreground text-xs sm:text-sm mb-2">
                {activeDeal.name}
              </h4>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base sm:text-lg text-success">
                  payments
                </span>
                <span className="font-semibold text-foreground text-xs sm:text-sm">
                  {formatCurrencyCompact(activeDeal.value)}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  );
});
