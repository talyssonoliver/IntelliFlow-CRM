import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AccountEditPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-072" title="Edit Account" description="Update account information." group="dashboard" sprint={7}
      breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'Edit' }]} />
  );
}
