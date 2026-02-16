import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-102" title="Ticket Detail" description="View ticket details, assignee, and conversation." group="dashboard" sprint={17}
      breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'Detail' }]} />
  );
}
