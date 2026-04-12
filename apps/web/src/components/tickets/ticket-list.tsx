/**
 * SupportTicketList — Support-context wrapper around TicketList (PG-046)
 *
 * Constrains bulk actions to Assign, Update Status, and Resolve.
 * Blocks Escalate and Close actions (AC-007).
 */

import { useCallback } from 'react';
import { TicketList } from './TicketList';
import type { TicketListProps } from './TicketList';
import type { BulkActionType } from './types';

const ALLOWED_ACTIONS: Set<string> = new Set(['assign', 'updateStatus', 'resolve']);

export type SupportBulkActionType = 'assign' | 'updateStatus' | 'resolve';

export type SupportTicketListProps = Omit<TicketListProps, 'onBulkAction'> & {
  onBulkAction: (
    action: SupportBulkActionType,
    ticketIds: string[],
    params?: Record<string, unknown>
  ) => Promise<void>;
};

export function SupportTicketList({ onBulkAction, ...props }: Readonly<SupportTicketListProps>) {
  const filteredHandler = useCallback(
    async (action: BulkActionType, ticketIds: string[], params?: Record<string, unknown>) => {
      if (!ALLOWED_ACTIONS.has(action)) return;
      await onBulkAction(action as SupportBulkActionType, ticketIds, params);
    },
    [onBulkAction]
  );

  return <TicketList {...props} onBulkAction={filteredHandler} />;
}
