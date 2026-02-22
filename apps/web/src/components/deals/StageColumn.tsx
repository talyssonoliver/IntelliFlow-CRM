/**
 * StageColumn Component (PG-135)
 *
 * Single pipeline stage column with header and droppable area.
 * Extracted from page.tsx lines 336-386.
 *
 * @module StageColumn
 * AC-1: 7 stage columns render
 * AC-22: Stage columns use role="list" and deal cards wrapped in role="listitem"
 * AC-31: Uses React.memo for performance
 */

import * as React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import type { Deal, OpportunityStage } from './types';
import { PIPELINE_STAGE_CONFIG, formatCurrencyCompact } from './types';
import { DealCard } from './DealCard';

interface StageColumnProps {
  readonly stage: OpportunityStage;
  readonly deals: Deal[];
  readonly onDealNavigate: (dealId: string) => void;
  readonly pendingDealId?: string | null;
}

export const StageColumn = React.memo(function StageColumn({
  stage,
  deals,
  onDealNavigate,
  pendingDealId,
}: StageColumnProps) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      className="flex-1 min-w-[240px] sm:min-w-[280px] max-w-[300px]"
      role="region"
      aria-label={`${config.label} stage - ${deals.length} deals, ${formatCurrencyCompact(totalValue)}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: config.color }}
            aria-hidden="true"
          />
          <span className="font-medium text-foreground text-sm sm:text-base truncate">
            {config.label}
          </span>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-xs font-medium text-muted-foreground flex-shrink-0">
            {deals.length}
          </span>
        </div>
        <span className="text-xs sm:text-sm font-medium text-muted-foreground flex-shrink-0">
          {formatCurrencyCompact(totalValue)}
        </span>
      </div>

      {/* Droppable Area */}
      <div
        ref={setNodeRef}
        className="bg-muted/50 rounded-lg p-2 sm:p-2 h-[300px] sm:h-[500px] overflow-y-auto overscroll-contain scrollbar-thin"
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5" role="list" aria-label={`Deals in ${config.label}`}>
            {deals.map((deal) => (
              <div key={deal.id} role="listitem">
                <DealCard deal={deal} onNavigate={() => onDealNavigate(deal.id)} isPending={deal.id === pendingDealId} />
              </div>
            ))}
            {deals.length === 0 && (
              <div className="flex items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground">Drop deals here</p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
});
