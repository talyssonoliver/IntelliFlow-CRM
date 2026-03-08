'use client';

/**
 * Support Ticket Detail Page (PG-048)
 *
 * Thin tRPC wrapper around TicketDetail for support agent context.
 * Key differences from admin /tickets/[id] page:
 * - No delete/archive actions
 * - Close redirects to /support/tickets (not /tickets)
 * - Breadcrumbs use Support > Tickets path
 * - Related ticket links use /support/tickets/ prefix
 */

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Skeleton, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { TicketDetail } from '@/components/tickets';
import type { TicketDetailData, ResolutionInput } from '@/components/tickets';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { mapTicketToDetailData } from '@/lib/tickets/ticket-detail-mapper';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function SupportTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const { user } = useAuth();

  const utils = api.useUtils();

  // tRPC queries
  const { data: ticket, isLoading } = api.ticket.getById.useQuery({ id: ticketId });
  const { data: assigneeOptions = [], isLoading: isAssigneeOptionsLoading } =
    api.ticket.assignees.useQuery();

  // Generic update mutation — status, priority, assignment
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
      toast({
        title: 'Failed to add response',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = async (status: string) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status } as never);
      toast({ title: 'Status Updated', description: 'Ticket status has been updated.' });
    } catch {
      // Handled in mutation onError
    }
  };

  const handlePriorityChange = async (priority: string) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, priority } as never);
      toast({ title: 'Priority Updated', description: 'Ticket priority has been updated.' });
    } catch {
      // Handled in mutation onError
    }
  };

  const handleAssign = async (userId: string) => {
    const assigneeId = userId?.trim();
    if (!assigneeId || !UUID_RE.test(assigneeId)) {
      toast({
        title: 'Invalid Assignee',
        description: 'Cannot assign ticket because user ID is invalid.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: ticketId, assigneeId } as never);
      toast({ title: 'Ticket Assigned', description: 'Ticket has been reassigned.' });
    } catch {
      // Handled in mutation onError
    }
  };

  const handleAddResponse = async (content: string, isInternal: boolean) => {
    await addResponseMutation.mutateAsync({
      ticketId,
      content,
      authorName: user?.name ?? 'Support Agent',
      authorRole: isInternal ? 'internal' : 'agent',
    });
  };

  const handleResolve = async (_resolution: ResolutionInput) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status: 'RESOLVED' } as never);
      toast({ title: 'Ticket Resolved', description: 'The ticket has been marked as resolved.' });
    } catch {
      // Handled in mutation onError
    }
  };

  const handleClose = async () => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status: 'CLOSED' } as never);
      toast({ title: 'Ticket Closed', description: 'The ticket has been closed.' });
      router.push('/support/tickets');
    } catch {
      // Handled in mutation onError
    }
  };

  // Normalize assignee avatars (called before early returns for Rules of Hooks)
  const normalizedAssigneeOptions = useMemo(
    () =>
      assigneeOptions.map((option) => ({
        ...option,
        avatar: normalizeAvatarSource(option.avatar) ?? null,
      })),
    [assigneeOptions]
  );

  // Loading skeleton
  if (isLoading) {
    return <TicketDetailSkeleton />;
  }

  if (!ticket) {
    return (
      <PageHeader
        breadcrumbs={[
          { label: 'Support', href: '/support' },
          { label: 'Tickets', href: '/support/tickets' },
          { label: 'Not Found' },
        ]}
        title="Ticket Not Found"
        description={`No ticket found with ID "${ticketId}"`}
      />
    );
  }

  const ticketDetail: TicketDetailData = mapTicketToDetailData(ticket);

  return (
    <TicketDetail
      ticket={ticketDetail}
      isLoading={updateMutation.isPending || addResponseMutation.isPending}
      currentUserId={user?.id ?? null}
      currentUserName={user?.name ?? null}
      assigneeOptions={normalizedAssigneeOptions}
      isAssigneeOptionsLoading={isAssigneeOptionsLoading}
      onStatusChange={handleStatusChange}
      onPriorityChange={handlePriorityChange}
      onAssign={handleAssign}
      onAddResponse={handleAddResponse}
      onResolve={handleResolve}
      onClose={handleClose}
      listHref="/support/tickets"
      detailUrlPrefix="/support/tickets"
    />
  );
}

function TicketDetailSkeleton() {
  return (
    <div
      className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-[#0B1116] p-6 md:p-8"
      data-testid="ticket-detail-skeleton"
    >
      <div className="mx-auto flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>

        <Card className="p-4">
          <Skeleton className="h-10 w-full" />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <aside className="lg:col-span-3 flex flex-col gap-6">
            <Card className="p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={`left-meta-${i}`} className="h-4 w-full" />
              ))}
            </Card>
          </aside>
          <section className="lg:col-span-6">
            <Card className="p-6 space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </Card>
          </section>
          <aside className="lg:col-span-3 flex flex-col gap-6">
            <Card className="p-5 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
