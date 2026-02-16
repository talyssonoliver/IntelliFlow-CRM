import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ProductsPage() {
  return (
    <PlaceholderPage taskId="PG-091" title="Products" description="Product catalog with pricing and configuration." group="dashboard" sprint={13}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Products' }]} />
  );
}
