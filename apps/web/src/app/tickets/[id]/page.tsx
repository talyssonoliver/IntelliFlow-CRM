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

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, Skeleton, toast } from '@intelliflow/ui';
import { TicketDetail } from '@/components/tickets';
import type { TicketDetailData, ResolutionInput } from '@/components/tickets';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { mapTicketToDetailData } from '@/lib/tickets/ticket-detail-mapper';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{8,}$/;

function isValidEntityId(id: string): boolean {
  return UUID_RE.test(id) || CUID_RE.test(id);
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const { user } = useAuth();

  const utils = api.useUtils();

  const validId = isValidEntityId(ticketId);

  // tRPC queries — only fire when the URL param looks like a real ID
  const { data: ticket, isLoading } = api.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: validId }
  );
  const { data: assigneeOptions = [], isLoading: isAssigneeOptionsLoading } =
    api.ticket.assignees.useQuery();

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
      toast({
        title: 'Failed to add response',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = api.ticket.delete.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
      toast({ title: 'Ticket Deleted', description: 'The ticket has been permanently deleted.' });
      router.push('/tickets');
    },
    onError: (error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  const archiveMutation = api.ticket.archive.useMutation({
    onSuccess: () => {
      utils.ticket.getById.invalidate({ id: ticketId });
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
      toast({ title: 'Ticket Archived', description: 'The ticket has been archived.' });
      router.push('/tickets');
    },
    onError: (error) => {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleStatusChange = async (status: string) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status } as never);
      toast({ title: 'Status Updated', description: 'Ticket status has been updated.' });
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  const handlePriorityChange = async (priority: string) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, priority } as never);
      toast({ title: 'Priority Updated', description: 'Ticket priority has been updated.' });
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
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
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  const handleAddResponse = async (content: string, _isInternal: boolean) => {
    await addResponseMutation.mutateAsync({
      ticketId,
      content,
      authorName: 'Current User',
      authorRole: 'agent',
    });
  };

  const handleResolve = async (_resolution: ResolutionInput) => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status: 'RESOLVED' } as never);
      toast({ title: 'Ticket Resolved', description: 'The ticket has been marked as resolved.' });
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  const handleClose = async () => {
    try {
      await updateMutation.mutateAsync({ id: ticketId, status: 'CLOSED' } as never);
      toast({ title: 'Ticket Closed', description: 'The ticket has been closed.' });
      router.push('/tickets');
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: ticketId });
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync({ id: ticketId });
    } catch {
      // Handled in mutation onError to avoid unhandled promise rejections
    }
  };

  // Must be called unconditionally (before early returns) to satisfy Rules of Hooks
  const normalizedAssigneeOptions = useMemo(
    () =>
      assigneeOptions.map((option) => ({
        ...option,
        avatar: normalizeAvatarSource(option.avatar) ?? null,
      })),
    [assigneeOptions]
  );

  // Loading skeleton
  if (validId && isLoading) {
    return <TicketDetailSkeleton />;
  }

  if (!validId || !ticket) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Ticket Not Found
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            The ticket you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission
            to view it.
          </p>
          <Link
            href="/tickets"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined !text-lg">arrow_back</span> Back to Tickets
          </Link>
        </Card>
      </div>
    );
  }

  const ticketDetail: TicketDetailData = mapTicketToDetailData(ticket);

  return (
    <TicketDetail
      ticket={ticketDetail}
      isLoading={
        updateMutation.isPending ||
        addResponseMutation.isPending ||
        deleteMutation.isPending ||
        archiveMutation.isPending
      }
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
      onDelete={handleDelete}
      onArchive={handleArchive}
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
                <Skeleton key={`left-meta-${i}`} className="h-4 w-full" /> // NOSONAR typescript:S6479
              ))}
            </Card>
            <Card className="p-5 space-y-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
            <Card className="p-5 space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          </aside>

          <section className="lg:col-span-6">
            <Card className="p-0 overflow-hidden">
              <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-4">
                <div className="flex gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={`tab-${i}`} className="h-6 w-20" /> // NOSONAR typescript:S6479
                  ))}
                </div>
              </div>
              <div className="p-6 space-y-4">
                <Skeleton className="h-24 w-full" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </Card>
          </section>

          <aside className="lg:col-span-3 flex flex-col gap-6">
            <Card className="p-5 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-4 w-28" />
            </Card>
            <Card className="p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
