import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function TicketsPage() {
  return (
    <PlaceholderPage taskId="PG-101" title="Tickets" description="Internal ticket management for customer issues." group="dashboard" sprint={17}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tickets' }]} />
  );
}
