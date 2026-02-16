import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DealsPage() {
  return (
    <PlaceholderPage taskId="PG-074" title="Deals" description="Manage your sales deals and opportunities." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Deals' }]} />
  );
}
