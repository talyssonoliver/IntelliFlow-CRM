import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AppearanceSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-124" title="Appearance" description="Theme, color scheme, and display preferences." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Appearance' }]} />
  );
}
