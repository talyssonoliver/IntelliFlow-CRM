import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function WebhooksGuidePage() {
  return (
    <PlaceholderPage
      taskId="PG-034"
      title="Webhooks"
      description="Configure and manage webhook endpoints for real-time event notifications."
      group="developer"
      sprint={22}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'Webhooks' }]}
    />
  );
}
