/**
 * DealCard Component (PG-135)
 *
 * Individual deal card with drag handle, info display, and navigation.
 * Extracted from page.tsx lines 223-326.
 *
 * @module DealCard
 * AC-2: Deal cards display name, account, value, close date, probability bar
 * AC-10: Clicking a deal card navigates to /deals/{id}
 * AC-20: Keyboard navigation for DnD
 * AC-31: Uses React.memo for performance
 */

import * as React from 'react';
import { cn } from '@intelliflow/ui';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Deal } from './types';
import { formatDealValue } from './types';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface DealCardProps {
  readonly deal: Deal;
  readonly onNavigate: () => void;
  readonly isPending?: boolean;
}

function formatDate(dateStr: string | null, timezone: string = 'Europe/London'): string {
  if (!dateStr) return 'No date';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}

export const DealCard = React.memo(function DealCard({
  deal,
  onNavigate,
  isPending,
}: Readonly<DealCardProps>) {
  const { timezone } = useTimezoneContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { type: 'deal', deal },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative bg-card rounded-lg border border-border text-left w-full',
        'p-3 sm:p-4 cursor-pointer touch-pan-y',
        'hover:border-primary hover:shadow-md focus-within:ring-2 focus-within:ring-primary',
        isPending && 'animate-pulse ring-2 ring-primary/50 opacity-75',
        isDragging
          ? 'opacity-50 shadow-lg ring-2 ring-primary'
          : 'transition-[border-color,box-shadow] duration-200'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <h4 className="min-w-0 flex-1 font-medium text-foreground text-xs sm:text-sm">
          {/* A real button, stretched over the whole card, so the card opens the deal by mouse, touch and keyboard. */}
          <button
            type="button"
            aria-label={`View deal: ${deal.name}`}
            className="block w-full text-left line-clamp-2 focus:outline-none after:absolute after:inset-0 after:content-['']"
            onClick={onNavigate}
          >
            {deal.name}
          </button>
        </h4>
        <button
          type="button"
          aria-label="Drag to move deal"
          className="relative z-10 p-1 -mr-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          {...attributes}
          {...listeners}
        >
          <span className="material-symbols-outlined text-base sm:text-lg">drag_indicator</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="material-symbols-outlined text-sm">business</span>
          <span className="truncate">{deal.accountName}</span>
        </div>

        {deal.contactName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-symbols-outlined text-sm">person</span>
            <span className="truncate">{deal.contactName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-border">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base sm:text-lg text-success">
            payments
          </span>
          <span className="font-semibold text-foreground text-xs sm:text-sm">
            {formatDealValue(deal.value)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="material-symbols-outlined text-xs sm:text-sm">event</span>
          <span>{formatDate(deal.expectedCloseDate, timezone)}</span>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Probability</span>
          <span className="font-medium text-foreground">{deal.probability}%</span>
        </div>
        <div className="h-1 sm:h-1.5 bg-muted rounded-full overflow-hidden">
          <progress
            className="block h-full w-full appearance-none [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-all [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary"
            value={deal.probability}
            max={100}
            aria-label={`Probability: ${deal.probability}%`}
          />
        </div>
      </div>
    </div>
  );
});
