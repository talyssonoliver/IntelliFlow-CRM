import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewTicketPage() {
  return (
    <PlaceholderPage
      taskId="PG-045"
      title="New Support Ticket"
      description="Create a new support request."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Tickets', href: '/support/tickets' }, { label: 'New Ticket' }]}
    />
  );
}
