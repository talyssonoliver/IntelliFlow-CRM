import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewContactPage() {
  return (
    <PlaceholderPage taskId="PG-065" title="New Contact" description="Create a new contact with enrichment." group="dashboard" sprint={5}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contacts', href: '/contacts' }, { label: 'New Contact' }]} />
  );
}
