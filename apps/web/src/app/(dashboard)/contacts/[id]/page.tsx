import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-066" title="Contact Detail" description="Contact profile with relationship mapping and activity." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: 'Detail' }]} />
  );
}
