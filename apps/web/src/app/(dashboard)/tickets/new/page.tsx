import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewTicketPage() {
  return (
    <PlaceholderPage taskId="PG-101" title="New Ticket" description="Create a new internal ticket." group="dashboard" sprint={17}
      breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'New Ticket' }]} />
  );
}
