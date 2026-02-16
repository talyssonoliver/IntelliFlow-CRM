import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function BillingSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-119" title="Billing Settings" description="Manage subscription plan and billing details." group="settings" sprint={19}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]} />
  );
}
