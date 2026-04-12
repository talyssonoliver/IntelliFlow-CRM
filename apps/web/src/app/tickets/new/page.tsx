'use client';

/**
 * New Ticket Page — Create ticket form wrapper (PG-137)
 *
 * @implements AC-11 (TicketForm with createTicketSchema validation)
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, toast } from '@intelliflow/ui';
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
    <div className="flex flex-col gap-5 p-2 sm:p-3 md:p-4">
      {/* Breadcrumbs + Title */}
      <div className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="flex">
          <ol className="flex items-center space-x-2">
            <li>
              <Link
                href="/dashboard"
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </li>
            <li>
              <Link
                href="/tickets"
                className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors"
              >
                Tickets
              </Link>
            </li>
            <li>
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </li>
            <li>
              <span className="text-slate-900 dark:text-white text-sm font-medium">New Ticket</span>
            </li>
          </ol>
        </nav>

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
          <TicketForm
            mode="create"
            onSubmit={(data) => createMutation.mutateAsync(data as never).then(() => {})}
            onCancel={() => router.push('/tickets')}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </Card>
    </div>
  );
}
