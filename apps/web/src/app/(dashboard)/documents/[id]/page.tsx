import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-100" title="Document Detail" description="View document with version history." group="dashboard" sprint={16}
      breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: 'Detail' }]} />
  );
}
