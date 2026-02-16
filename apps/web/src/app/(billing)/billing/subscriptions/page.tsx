import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SubscriptionsPage() {
  return (
    <PlaceholderPage
      taskId="PG-030"
      title="Subscriptions"
      description="View and manage your active subscriptions."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Subscriptions' }]}
    />
  );
}
