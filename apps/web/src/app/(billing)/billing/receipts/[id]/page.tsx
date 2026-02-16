import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ReceiptPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage
      taskId="PG-031"
      title="Payment Receipt"
      description="View and download payment receipt."
      group="billing"
      sprint={19}
      breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Receipt' }]}
    />
  );
}
