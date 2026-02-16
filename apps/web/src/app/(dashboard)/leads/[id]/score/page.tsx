import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LeadScorePage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-063" title="AI Score Detail" description="Detailed AI scoring breakdown with contributing factors." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Leads', href: '/leads' }, { label: 'AI Score' }]} />
  );
}
