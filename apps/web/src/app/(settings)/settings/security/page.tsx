import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function SecuritySettingsPage() {
  return (
    <PlaceholderPage taskId="PG-123" title="Security Settings" description="IP allowlists, SSO configuration, and security policies." group="settings" sprint={16}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Security' }]} />
  );
}
