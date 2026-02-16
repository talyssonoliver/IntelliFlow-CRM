import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ReportsPage() {
  return (
    <PlaceholderPage taskId="PG-086" title="Reports" description="Custom report builder with templates and exports." group="dashboard" sprint={12}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]} />
  );
}
