import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DealTimelinePage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-079" title="Deal Timeline" description="Complete activity timeline for this deal." group="dashboard" sprint={9}
      breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: 'Timeline' }]} />
  );
}
