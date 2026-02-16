'use client';

/**
 * New Ticket Page — Create ticket form wrapper (PG-137)
 *
 * @implements AC-11 (TicketForm with createTicketSchema validation)
 */

import { useRouter } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { TicketForm } from '@/components/tickets';
import { api } from '@/lib/api';

export default function NewTicketPage() {
  const router = useRouter();
  const createMutation = api.ticket.create.useMutation({
    onSuccess: (data: { id: string }) => {
      toast({
        title: 'Ticket Created',
        description: 'Your ticket has been submitted successfully.',
      });
      router.push(`/tickets/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: 'Failed to create ticket',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Tickets', href: '/tickets' },
          { label: 'New Ticket' },
        ]}
        title="Create Ticket"
        description="Submit a new support ticket"
      />
      <TicketForm
        mode="create"
        onSubmit={(data) => createMutation.mutateAsync(data as never).then(() => {})}
        onCancel={() => router.push('/tickets')}
        isSubmitting={createMutation.isPending}
      />
    </>
  );
}
