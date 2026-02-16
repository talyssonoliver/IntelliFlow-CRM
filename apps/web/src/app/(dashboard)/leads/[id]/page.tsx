import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-061" title="Lead Detail" description="View lead profile, activity history, and AI score breakdown." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leads', href: '/leads' }, { label: 'Lead Detail' }]} />
  );
}
