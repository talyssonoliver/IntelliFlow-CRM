'use client';

/**
 * StatusUpdater — FSM-driven status transition component (PG-048)
 *
 * Shows valid transitions from VALID_TICKET_TRANSITIONS, excluding ARCHIVED
 * for support agent context. Uses domain-driven state machine.
 */

import { useState } from 'react';
import { VALID_TICKET_TRANSITIONS, isTerminalStatus } from '@intelliflow/domain';
import type { TicketStatus } from '@intelliflow/domain';
import { getStatusConfig } from '@/lib/tickets/ticket-utils';
import { cn } from '@/lib/utils';

export interface StatusUpdaterProps {
  currentStatus: TicketStatus;
  onStatusChange: (status: string) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}

export function StatusUpdater({
  currentStatus,
  onStatusChange,
  isLoading = false,
  disabled = false,
}: StatusUpdaterProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fallback for statuses not in getStatusConfig (e.g., ARCHIVED)
  const defaultConfig = {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-500 dark:text-slate-400',
  };
  const statusConfig = getStatusConfig(currentStatus) ?? defaultConfig;

  // Get valid transitions, excluding ARCHIVED for support agent context
  const validTargets = (VALID_TICKET_TRANSITIONS[currentStatus] ?? []).filter(
    (status) => status !== 'ARCHIVED'
  );

  // Disable when: loading, explicitly disabled, terminal state, closed (no support transitions), or no valid targets
  const isDisabled =
    isLoading ||
    disabled ||
    isTerminalStatus(currentStatus) ||
    currentStatus === 'CLOSED' ||
    validTargets.length === 0;

  const handleSelect = async (targetStatus: string) => {
    setIsOpen(false);
    await onStatusChange(targetStatus);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Change status"
        disabled={isDisabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isDisabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            statusConfig.bg,
            statusConfig.text
          )}
        >
          {currentStatus}
        </span>
        {!isDisabled && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {}
      {isOpen && !isDisabled && (
        <div
          role="menu"
          aria-label="Status options"
          className="absolute z-50 mt-1 min-w-[200px] rounded-lg border bg-popover p-1 shadow-md"
        >
          {validTargets.map((targetStatus) => {
            const targetConfig = getStatusConfig(targetStatus) ?? defaultConfig;
            return (
              <button
                key={targetStatus}
                type="button"
                role="menuitem"
                aria-label={targetStatus}
                onClick={() => handleSelect(targetStatus)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    targetConfig.bg,
                    targetConfig.text
                  )}
                >
                  {targetStatus}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {}
    </div>
  );
}
