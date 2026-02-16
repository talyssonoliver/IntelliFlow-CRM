import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AccountSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-106" title="Account Settings" description="Password, sessions, and account security." group="settings" sprint={13}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Account' }]} />
  );
}
