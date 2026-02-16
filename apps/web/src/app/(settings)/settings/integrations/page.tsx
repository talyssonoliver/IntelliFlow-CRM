import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function IntegrationsSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-115" title="Integrations" description="Connect Slack, Google Workspace, Salesforce, and more." group="settings" sprint={17}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Integrations' }]} />
  );
}
