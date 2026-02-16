import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function QuotesPage() {
  return (
    <PlaceholderPage taskId="PG-094" title="Quotes" description="Create and manage sales quotes." group="dashboard" sprint={14}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Quotes' }]} />
  );
}
