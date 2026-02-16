import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ImportExportSettingsPage() {
  return (
    <PlaceholderPage taskId="PG-117" title="Import / Export" description="Bulk import from CSV/Excel and export data." group="settings" sprint={18}
      breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Import / Export' }]} />
  );
}
