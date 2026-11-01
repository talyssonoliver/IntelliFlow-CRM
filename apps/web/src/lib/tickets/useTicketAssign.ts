/**
 * Ticket assign flow (#1097), shared by both ticket detail pages.
 */

import { useCallback } from 'react';
import { toast } from '@intelliflow/ui';
import { INVALID_ASSIGNEE_TOAST, toAssigneeId } from './ticket-assignee';

export type AssignTicket = (input: { id: string; assigneeId: string }) => Promise<unknown>;

/**
 * Returns the handler both pages pass to TicketDetail's onAssign. An id the api would reject never
 * reaches it; a failed update is reported by the mutation's own onError, so it is swallowed here.
 */
export function useTicketAssign(ticketId: string, assignTicket: AssignTicket) {
  return useCallback(
    async (userId: string) => {
      const assigneeId = toAssigneeId(userId);
      if (!assigneeId) {
        toast(INVALID_ASSIGNEE_TOAST);
        return;
      }

      try {
        await assignTicket({ id: ticketId, assigneeId });
        toast({ title: 'Ticket Assigned', description: 'Ticket has been reassigned.' });
      } catch {
        // Handled in mutation onError to avoid unhandled promise rejections
      }
    },
    [ticketId, assignTicket]
  );
}
