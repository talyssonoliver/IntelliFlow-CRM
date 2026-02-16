import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ProfileSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-105" title="Profile Settings" description="Update your name, avatar, email, and personal preferences." group="settings" sprint={13}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Profile' }]} />
  );
}
