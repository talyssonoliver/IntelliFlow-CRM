import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function EmailTemplatesSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-120" title="Email Templates" description="Manage system and marketing email templates." group="settings" sprint={17}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Email Templates' }]} />
  );
}
