import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SupportTicketsPage() {
  return (
    <PlaceholderPage
      taskId="PG-044"
      title="Support Tickets"
      description="View and manage your support tickets."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Tickets' }]}
    />
  );
}
