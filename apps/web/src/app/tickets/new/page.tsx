'use client';

/**
 * New Ticket Page — Create ticket form wrapper (PG-137)
 *
 * @implements AC-11 (TicketForm with createTicketSchema validation)
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, toast } from '@intelliflow/ui';
import { NewTicketContactForm } from '@/components/tickets/NewTicketContactForm';
import { api } from '@/lib/api';
import { invalidateTicketsCache } from '@/app/tickets/actions';

import { Breadcrumbs } from '@/components/shared/page-header';
export default function NewTicketPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <NewTicketPageContent />
    </Suspense>
  );
}

function NewTicketPageContent() {
  const router = useRouter();
  const contactId = useSearchParams().get('contactId');
  const createMutation = api.ticket.create.useMutation({
    onSuccess: (data: { id: string }) => {
      // ticket.create has a contactEmail side-effect that writes to ContactActivity
      invalidateTicketsCache(undefined, true).catch(() => {});
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
    <div className="flex flex-col gap-5 p-2 sm:p-3 md:p-4">
      {/* Breadcrumbs + Title */}
      <div className="flex flex-col gap-2">
        <Breadcrumbs
          endsWithCurrentPage={false}
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Tickets', href: '/tickets' },
          ]}
        />

        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Create Ticket
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Submit a new support ticket.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6">
          <NewTicketContactForm
            contactId={contactId}
            onSubmit={(data) => createMutation.mutateAsync(data as never).then(() => {})}
            onCancel={() => router.push('/tickets')}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </Card>
    </div>
  );
}
