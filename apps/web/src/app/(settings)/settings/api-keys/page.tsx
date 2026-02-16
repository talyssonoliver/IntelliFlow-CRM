import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ApiKeysSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-113" title="API Keys" description="Generate, revoke, and manage API keys." group="settings" sprint={16}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'API Keys' }]} />
  );
}
