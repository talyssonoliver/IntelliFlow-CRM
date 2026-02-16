import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function UserDetailPage({ params }: { params: { id: string } }) {
  return (
    <PlaceholderPage taskId="PG-108" title="User Detail" description="User profile, role assignments, and activity." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Users', href: '/settings/users' }, { label: 'User' }]} />
  );
}
