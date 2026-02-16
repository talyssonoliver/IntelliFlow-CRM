import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewReportPage() {
  return (
    <PlaceholderPage taskId="PG-086" title="New Report" description="Build a custom report with drag-and-drop fields." group="dashboard" sprint={12}
      breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'New Report' }]} />
  );
}
