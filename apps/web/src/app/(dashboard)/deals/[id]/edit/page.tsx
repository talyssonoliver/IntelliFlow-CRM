import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DealEditPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-077" title="Edit Deal" description="Update deal information and stage." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: 'Edit' }]} />
  );
}
