import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ContactMergePage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-068" title="Merge Contacts" description="Merge duplicate contacts into one record." group="dashboard" sprint={10}
      breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: 'Merge' }]} />
  );
}
