'use client';

import { AssignSheet } from '@/components/shared/assign-sheet';
import type { TicketAssigneeOption } from './types';

interface TicketAssignSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketSubject: string;
  currentUserId?: string | null;
  currentUserName?: string | null;
  assignees?: TicketAssigneeOption[];
  isAssigning?: boolean;
  isLoadingOptions?: boolean;
  onAssign: (userId: string) => Promise<void>;
}

export function TicketAssignSidebar({
  open,
  onOpenChange,
  ticketSubject,
  currentUserId = null,
  currentUserName = null,
  assignees = [],
  isAssigning = false,
  isLoadingOptions = false,
  onAssign,
}: Readonly<TicketAssignSidebarProps>) {
  return (
    <AssignSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Ticket"
      description={`Select an owner for "${ticketSubject}".`}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      assignees={assignees}
      isAssigning={isAssigning}
      isLoadingOptions={isLoadingOptions}
      onAssign={(userId) => {
        onAssign(userId).catch(() => {
          // Mutation error feedback is surfaced by caller
        });
      }}
    />
  );
}
