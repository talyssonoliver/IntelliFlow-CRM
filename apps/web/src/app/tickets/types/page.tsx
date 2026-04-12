'use client';

import { PageHeader } from '@/components/shared/page-header';
import { TicketTypeManager } from '@/components/tickets/TicketTypeManager';

export default function TicketTypesPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'Ticket Types' }]}
        title="Ticket Types"
        description="Organize tickets with categories and assign SLA policies."
      />
      <TicketTypeManager />
    </>
  );
}
