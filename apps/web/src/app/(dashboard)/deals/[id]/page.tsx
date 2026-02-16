import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DealDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-076" title="Deal Detail" description="Deal overview with timeline and financial summary." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: 'Detail' }]} />
  );
}
