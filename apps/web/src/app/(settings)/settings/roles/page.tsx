import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function RolesSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-110" title="Roles & Permissions" description="Define roles with granular permission controls." group="settings" sprint={15}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Roles & Permissions' }]} />
  );
}
