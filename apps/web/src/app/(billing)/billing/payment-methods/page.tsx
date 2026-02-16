import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function PaymentMethodsPage() {
  return (
    <PlaceholderPage
      taskId="PG-029"
      title="Payment Methods"
      description="Manage your payment methods and billing information."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Payment Methods' }]}
    />
  );
}
