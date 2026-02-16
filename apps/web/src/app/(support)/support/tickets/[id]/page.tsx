import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage
      taskId="PG-046"
      title="Ticket Detail"
      description="View ticket status, conversation, and resolution."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Tickets', href: '/support/tickets' }, { label: 'Ticket' }]}
    />
  );
}
