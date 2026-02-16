import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AccountsPage() {
  return (
    <PlaceholderPage taskId="PG-069" title="Accounts" description="Manage company accounts and organizations." group="dashboard" sprint={6}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Accounts' }]} />
  );
}
