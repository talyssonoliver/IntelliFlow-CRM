import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function QuoteDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-096" title="Quote Detail" description="View quote with line items and approval status." group="dashboard" sprint={14}
      breadcrumbs={[{ label: 'Quotes', href: '/quotes' }, { label: 'Detail' }]} />
  );
}
