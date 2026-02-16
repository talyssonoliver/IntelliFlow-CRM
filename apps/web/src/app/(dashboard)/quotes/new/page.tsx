import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewQuotePage() {
  return (
    <PlaceholderPage taskId="PG-095" title="New Quote" description="Create a new quote with products and pricing." group="dashboard" sprint={14}
      breadcrumbs={[{ label: 'Quotes', href: '/quotes' }, { label: 'New Quote' }]} />
  );
}
