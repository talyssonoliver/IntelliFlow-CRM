import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function OrganizationSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-107" title="Organization Settings" description="Company details, branding, and default configuration." group="settings" sprint={14}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Organization' }]} />
  );
}
