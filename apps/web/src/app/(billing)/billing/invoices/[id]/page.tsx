import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage
      taskId="PG-028"
      title="Invoice Detail"
      description="View invoice details and download PDF."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Invoices', href: '/billing/invoices' }, { label: 'Invoice' }]}
    />
  );
}
