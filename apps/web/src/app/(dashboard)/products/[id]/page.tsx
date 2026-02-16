import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-093" title="Product Detail" description="View product details, pricing, and usage." group="dashboard" sprint={13}
      breadcrumbs={[{ label: 'Products', href: '/products' }, { label: 'Detail' }]} />
  );
}
