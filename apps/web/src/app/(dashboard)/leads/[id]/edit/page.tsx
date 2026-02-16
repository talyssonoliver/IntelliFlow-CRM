import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LeadEditPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-062" title="Edit Lead" description="Update lead information and qualification status." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Leads', href: '/leads' }, { label: 'Edit' }]} />
  );
}
