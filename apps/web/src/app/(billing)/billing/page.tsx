import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function BillingPortalPage() {
  return (
    <PlaceholderPage
      taskId="PG-025"
      title="Billing Portal"
      description="Manage your subscription, view invoices, and update payment methods."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Billing' }]}
    />
  );
}
