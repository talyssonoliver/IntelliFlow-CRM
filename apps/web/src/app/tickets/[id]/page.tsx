'use client';

/**
 * Ticket Detail Page — tRPC integration wrapper (PG-137)
 *
 * Thin wrapper that fetches a single ticket via tRPC and delegates
 * rendering to the TicketDetail extracted component.
 *
 * @implements AC-4 (Detail page loads real data from api.ticket.getById)
 * @implements AC-5 (SLA countdown timer + EscalationAlert integration)
 * @implements AC-7 (Status transitions via api.ticket.update)
 * @implements AC-8 (Reply composer with api.ticket.addResponse)
 * @implements AC-9 (Resolution flow via status update to RESOLVED)
 * @implements AC-10 (All tabs fully implemented in TicketDetail)
 */

import { useParams, useRouter } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { TicketDetail } from '@/components/tickets';
import type { TicketDetailData, ResolutionInput } from '@/components/tickets';
import { api } from '@/lib/api';

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const utils = api.useUtils();

  // tRPC queries
  const { data: ticket, isLoading } = api.ticket.getById.useQuery({ id: ticketId });

  // Generic update mutation — used for status, priority, and assignment changes
  const updateMutation = api.ticket.update.useMutation({
    onSuccess: () => {
      utils.ticket.getById.invalidate({ id: ticketId });
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
    },
    onError: (error) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const addResponseMutation = api.ticket.addResponse.useMutation({
    onSuccess: () => {
      utils.ticket.getById.invalidate({ id: ticketId });
      toast({ title: 'Response Added', description: 'Your response has been posted.' });
    },
    onError: (error) => {
      toast({ title: 'Failed to add response', description: error.message, variant: 'destructive' });
    },
  });

  const handleStatusChange = async (status: string) => {
    await updateMutation.mutateAsync({ id: ticketId, status } as never);
    toast({ title: 'Status Updated', description: 'Ticket status has been updated.' });
  };

  const handlePriorityChange = async (priority: string) => {
    await updateMutation.mutateAsync({ id: ticketId, priority } as never);
    toast({ title: 'Priority Updated', description: 'Ticket priority has been updated.' });
  };

  const handleAssign = async (userId: string) => {
    await updateMutation.mutateAsync({ id: ticketId, assigneeId: userId } as never);
    toast({ title: 'Ticket Assigned', description: 'Ticket has been reassigned.' });
  };

  const handleAddResponse = async (content: string, isInternal: boolean) => {
    await addResponseMutation.mutateAsync({
      ticketId,
      content,
      authorName: 'Current User',
      authorRole: isInternal ? 'agent' : 'agent',
    });
  };

  const handleResolve = async (_resolution: ResolutionInput) => {
    await updateMutation.mutateAsync({ id: ticketId, status: 'RESOLVED' } as never);
    toast({ title: 'Ticket Resolved', description: 'The ticket has been marked as resolved.' });
  };

  const handleClose = async () => {
    await updateMutation.mutateAsync({ id: ticketId, status: 'CLOSED' } as never);
    toast({ title: 'Ticket Closed', description: 'The ticket has been closed.' });
    router.push('/tickets');
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Tickets', href: '/tickets' },
            { label: 'Loading...' },
          ]}
          title="Loading Ticket..."
        />
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
            progress_activity
          </span>
        </div>
      </>
    );
  }

  if (!ticket) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Tickets', href: '/tickets' },
            { label: 'Not Found' },
          ]}
          title="Ticket Not Found"
          description={`No ticket found with ID "${ticketId}"`}
        />
      </>
    );
  }

  return (
    <TicketDetail
      ticket={ticket as unknown as TicketDetailData}
      isLoading={updateMutation.isPending || addResponseMutation.isPending}
      onStatusChange={handleStatusChange}
      onPriorityChange={handlePriorityChange}
      onAssign={handleAssign}
      onAddResponse={handleAddResponse}
      onResolve={handleResolve}
      onClose={handleClose}
    />
  );
}
