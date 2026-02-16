import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function RoleDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-112" title="Role Detail" description="View and edit role permissions." group="settings" sprint={15}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Roles', href: '/settings/roles' }, { label: 'Role' }]} />
  );
}
