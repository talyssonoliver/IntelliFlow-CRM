'use client';

/**
 * Support New Ticket Page (PG-047)
 *
 * Support-agent-focused ticket creation at /support/tickets/new.
 * Creates ticket first, then uploads attachments sequentially.
 *
 * @implements AC-001 (page loads at /support/tickets/new)
 * @implements AC-007 (attachments uploaded as TicketAttachment records)
 * @implements AC-008 (redirect to /support/tickets/{id} on success)
 * @implements AC-009 (error handling with toasts)
 * @implements AC-010 (breadcrumbs: Support > Tickets > New Ticket)
 * @implements AC-011 (cancel navigates to /support/tickets)
 * @implements AC-012 (reachable via sidebar Quick Links)
 */

import { useRouter } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { SupportTicketForm } from '@/components/tickets/ticket-form';
import { api } from '@/lib/api';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

export default function SupportNewTicketPage() {
  const router = useRouter();
  const createMutation = api.ticket.create.useMutation();
  const addAttachmentMutation = api.ticket.addAttachment.useMutation();

  const handleSubmit = async (data: Record<string, unknown>, files: File[]) => {
    // Step 1: Create the ticket
    let ticketId: string;
    try {
      const result = await createMutation.mutateAsync(data as never);
      ticketId = (result as { id: string }).id;
    } catch (error) {
      toast({
        title: 'Failed to create ticket',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
      return;
    }

    // Step 2: Upload attachments (if any)
    if (files.length > 0) {
      let failedCount = 0;
      for (const file of files) {
        try {
          const content = await fileToBase64(file);
          await addAttachmentMutation.mutateAsync({
            ticketId,
            name: file.name,
            size: formatFileSize(file.size),
            sizeBytes: file.size,
            fileType: file.type,
            content,
          });
        } catch {
          failedCount++;
        }
      }

      if (failedCount > 0) {
        toast({
          title: 'Ticket created with warnings',
          description: `Ticket created but ${failedCount} attachment(s) failed to upload.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Ticket Created',
          description: 'Your ticket and attachments have been submitted successfully.',
        });
      }
    } else {
      toast({
        title: 'Ticket Created',
        description: 'Your ticket has been submitted successfully.',
      });
    }

    // Step 3: Redirect to the created ticket
    router.push(`/support/tickets/${ticketId}`);
  };

  const isSubmitting = createMutation.isPending || addAttachmentMutation.isPending;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Support', href: '/support' },
          { label: 'Tickets', href: '/support/tickets' },
          { label: 'New Ticket' },
        ]}
        title="Create Support Ticket"
        description="Log a new customer support ticket"
      />
      <SupportTicketForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/support/tickets')}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
