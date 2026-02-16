import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CheckoutPage() {
  return (
    <PlaceholderPage
      taskId="PG-026"
      title="Checkout"
      description="Complete your plan purchase or upgrade."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Checkout' }]}
    />
  );
}
