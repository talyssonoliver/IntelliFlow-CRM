import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function WebhooksSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-114" title="Webhooks" description="Configure webhook endpoints for real-time events." group="settings" sprint={16}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Webhooks' }]} />
  );
}
