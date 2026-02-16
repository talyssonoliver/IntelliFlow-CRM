import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ActivityDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-082" title="Activity Detail" description="View activity details and related records." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Activities', href: '/activities' }, { label: 'Detail' }]} />
  );
}
