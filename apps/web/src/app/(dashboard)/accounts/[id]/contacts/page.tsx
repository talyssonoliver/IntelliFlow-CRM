import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AccountContactsPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-073" title="Account Contacts" description="Contacts associated with this account." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'Contacts' }]} />
  );
}
