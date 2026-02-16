import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewLeadPage() {
  return (
    <PlaceholderPage taskId="PG-060" title="New Lead" description="Create a new sales lead with AI-assisted data enrichment." group="dashboard" sprint={5}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leads', href: '/leads' }, { label: 'New Lead' }]} />
  );
}
