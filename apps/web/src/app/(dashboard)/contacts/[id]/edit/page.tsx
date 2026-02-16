import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ContactEditPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-067" title="Edit Contact" description="Update contact information." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: 'Edit' }]} />
  );
}
