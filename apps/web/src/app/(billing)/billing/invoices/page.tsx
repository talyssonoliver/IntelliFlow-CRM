import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function InvoicesPage() {
  return (
    <PlaceholderPage
      taskId="PG-027"
      title="Invoices"
      description="View and download your invoice history."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Invoices' }]}
    />
  );
}
