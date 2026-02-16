import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewProductPage() {
  return (
    <PlaceholderPage taskId="PG-092" title="New Product" description="Add a new product to the catalog." group="dashboard" sprint={13}
      breadcrumbs={[{ label: 'Products', href: '/products' }, { label: 'New Product' }]} />
  );
}
