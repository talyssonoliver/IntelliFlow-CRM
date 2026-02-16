import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function UsersSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-108" title="Users & Teams" description="Manage users, invitations, and team assignments." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Users & Teams' }]} />
  );
}
