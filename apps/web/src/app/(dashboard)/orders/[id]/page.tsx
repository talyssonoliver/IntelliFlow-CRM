import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-098" title="Order Detail" description="Order details with line items and fulfillment status." group="dashboard" sprint={15}
      breadcrumbs={[{ label: 'Orders', href: '/orders' }, { label: 'Detail' }]} />
  );
}
