import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function CustomFieldsSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-121" title="Custom Fields" description="Define custom fields for leads, contacts, and deals." group="settings" sprint={18}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Custom Fields' }]} />
  );
}
