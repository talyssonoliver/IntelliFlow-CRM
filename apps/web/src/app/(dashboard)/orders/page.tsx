import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function OrdersPage() {
  return (
    <PlaceholderPage taskId="PG-097" title="Orders" description="Order management and fulfillment tracking." group="dashboard" sprint={15}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Orders' }]} />
  );
}
