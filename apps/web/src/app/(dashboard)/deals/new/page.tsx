import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewDealPage() {
  return (
    <PlaceholderPage taskId="PG-075" title="New Deal" description="Create a new deal or opportunity." group="dashboard" sprint={8}
      breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: 'New Deal' }]} />
  );
}
