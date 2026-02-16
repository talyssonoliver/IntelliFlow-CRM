import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NotificationsSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-116" title="Notifications" description="Configure email, push, and in-app notification preferences." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Notifications' }]} />
  );
}
