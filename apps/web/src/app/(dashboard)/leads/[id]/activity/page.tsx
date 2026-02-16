import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LeadActivityPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-061" title="Lead Activity" description="Complete activity timeline for this lead." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Leads', href: '/leads' }, { label: 'Activity' }]} />
  );
}
