import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function InviteUserPage() {
  return (
    <PlaceholderPage taskId="PG-109" title="Invite User" description="Invite a new user to join the organization." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Users', href: '/settings/users' }, { label: 'Invite' }]} />
  );
}
