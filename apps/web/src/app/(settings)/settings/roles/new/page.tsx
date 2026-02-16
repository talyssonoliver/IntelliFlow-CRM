import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewRolePage() {
  return (
    <PlaceholderPage taskId="PG-111" title="New Role" description="Create a new role with permission assignments." group="settings" sprint={15}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Roles', href: '/settings/roles' }, { label: 'New Role' }]} />
  );
}
