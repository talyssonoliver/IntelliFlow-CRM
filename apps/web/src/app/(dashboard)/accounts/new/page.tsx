import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewAccountPage() {
  return (
    <PlaceholderPage taskId="PG-070" title="New Account" description="Create a new company account." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'New Account' }]} />
  );
}
